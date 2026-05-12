import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {GoogleGenerativeAI} from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import {runSave, SavedTestCase} from "./saveGeneratedCases.js";
import {verifyPermission} from "../utils/rbac.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateTestCasesRequest {
  featureDescription: string;
  projectId?: string;
  moduleName?: string;
  extraContext?: string;
  count?: number;
}

export interface GenerateAndSaveRequest extends GenerateTestCasesRequest {
  projectId: string;
  suiteId?: string;
}

export interface GenerateAndSaveResponse {
  generated: number;
  saved: number;
  message: string;
  testCases: SavedTestCase[];
}

export interface TestCase {
  title: string;
  description: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  type: "Functional" | "UI" | "API" | "Performance" | "Security" | "Regression";
  tags: string[];
}

// ---------------------------------------------------------------------------
// Shared system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a senior QA engineer. Given a feature description, generate detailed test cases in valid JSON only. " +
  "Return a JSON array of objects, each with: title (string), description (string), preconditions (string), " +
  "steps (array of strings), expectedResult (string), priority ('Critical'|'High'|'Medium'|'Low'), " +
  "type ('Functional'|'UI'|'API'|'Performance'|'Security'|'Regression'), tags (array of strings). " +
  "Return ONLY raw JSON array, no markdown, no explanation.";

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

interface ValidatedGenerateInput {
  featureDescription: string;
  moduleName: string | undefined;
  extraContext: string | undefined;
  resolvedCount: number;
}

function validateGenerateInput(data: GenerateTestCasesRequest): ValidatedGenerateInput {
  const {featureDescription, moduleName, extraContext, count = 5} = data;

  if (!featureDescription || typeof featureDescription !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "featureDescription is required and must be a string."
    );
  }
  if (featureDescription.trim().length === 0) {
    throw new HttpsError("invalid-argument", "featureDescription must not be empty.");
  }
  if (featureDescription.length > 2000) {
    throw new HttpsError(
      "invalid-argument",
      "featureDescription must not exceed 2000 characters."
    );
  }
  if (extraContext !== undefined && typeof extraContext !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "extraContext must be a string when provided."
    );
  }
  if (extraContext && extraContext.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "extraContext must not exceed 500 characters."
    );
  }
  if (moduleName !== undefined && typeof moduleName !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "moduleName must be a string when provided."
    );
  }

  const resolvedCount = count === undefined ? 5 : Number(count);
  if (!Number.isInteger(resolvedCount) || resolvedCount < 1 || resolvedCount > 20) {
    throw new HttpsError("invalid-argument", "count must be an integer between 1 and 20.");
  }

  return {featureDescription, moduleName, extraContext, resolvedCount};
}

// ---------------------------------------------------------------------------
// Core generation logic — shared between generateTestCases & generateAndSave
// ---------------------------------------------------------------------------

export async function runGeneration(
  apiKey: string,
  uid: string,
  featureDescription: string,
  moduleName: string | undefined,
  extraContext: string | undefined,
  resolvedCount: number
): Promise<TestCase[]> {
  // Build user prompt
  const userPromptParts: string[] = [
    `Feature Description:\n${featureDescription.trim()}`,
  ];
  if (moduleName && moduleName.trim().length > 0) {
    userPromptParts.push(`Module / Area: ${moduleName.trim()}`);
  }
  if (extraContext && extraContext.trim().length > 0) {
    userPromptParts.push(`Additional Context:\n${extraContext.trim()}`);
  }
  userPromptParts.push(
    `Please generate exactly ${resolvedCount} test case(s). Return ONLY a valid JSON array.`
  );
  const userPrompt = userPromptParts.join("\n\n");

  // Call Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.4,
    },
  });

  let rawContent: string;

  try {
    logger.info("Calling Gemini API", {uid, count: resolvedCount, featureLength: featureDescription.length});

    const result = await model.generateContent(userPrompt);
    const response = result.response;
    rawContent = response.text().trim();

    logger.info("Gemini API responded successfully", {uid, finishReason: response.candidates?.[0]?.finishReason});
  } catch (err) {
    logger.error("Gemini API call failed", {uid, error: String(err)});
    throw new HttpsError(
      "internal",
      "Failed to generate test cases due to an AI service error. Please try again."
    );
  }

  // Parse JSON
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const testCases = JSON.parse(cleaned) as TestCase[];
    if (!Array.isArray(testCases)) {
      throw new Error("Response is not a JSON array.");
    }
    return testCases;
  } catch (err) {
    logger.error("Failed to parse Gemini response as JSON", {uid, rawContent, error: String(err)});
    throw new HttpsError("internal", "AI returned an unexpected format. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve API key from env var (Spark-compatible)
// ---------------------------------------------------------------------------

function resolveApiKey(uid: string): string {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.error("GEMINI_API_KEY is not configured.", {uid});
    throw new HttpsError(
      "failed-precondition",
      "AI service is not configured. Set the GEMINI_API_KEY environment variable."
    );
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Callable: generateTestCases
// ---------------------------------------------------------------------------

export const generateTestCases = onCall(
  {
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request): Promise<TestCase[]> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate test cases.");
    }

    const {featureDescription, moduleName, extraContext, resolvedCount} =
      validateGenerateInput(request.data as GenerateTestCasesRequest);
    const projectId =
      typeof (request.data as GenerateTestCasesRequest)?.projectId === "string" &&
      (request.data as GenerateTestCasesRequest).projectId!.trim().length > 0 ?
        (request.data as GenerateTestCasesRequest).projectId!.trim() : request.auth.uid;

    if (!admin.apps.length) admin.initializeApp();
    await verifyPermission(request.auth.uid, projectId, ["Owner", "Admin", "QA Lead"]);

    const apiKey = resolveApiKey(request.auth.uid);

    return runGeneration(
      apiKey,
      request.auth.uid,
      featureDescription,
      moduleName,
      extraContext,
      resolvedCount
    );
  }
);

// ---------------------------------------------------------------------------
// Callable: generateAndSave
// ---------------------------------------------------------------------------

export const generateAndSave = onCall(
  {
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async (request): Promise<GenerateAndSaveResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const uid = request.auth.uid;

    const data = request.data as GenerateAndSaveRequest;
    const {featureDescription, moduleName, extraContext, resolvedCount} =
      validateGenerateInput(data);

    const {projectId, suiteId} = data;
    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "projectId is required.");
    }
    if (!admin.apps.length) admin.initializeApp();
    await verifyPermission(uid, projectId.trim(), ["Owner", "Admin", "QA Lead"]);

    const apiKey = resolveApiKey(uid);

    const testCases = await runGeneration(
      apiKey, uid, featureDescription, moduleName, extraContext, resolvedCount
    );

    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    let ids: string[];
    try {
      ids = await runSave(db, uid, projectId.trim(), testCases, suiteId ? suiteId.trim() : null, featureDescription);
    } catch (err) {
      logger.error("generateAndSave: failed to save cases", {uid, projectId, error: String(err)});
      throw new HttpsError("internal", "Test cases generated but could not be saved. Please try again.");
    }

    const savedTestCases: SavedTestCase[] = testCases.map((tc, i) => ({...tc, id: ids[i]}));
    logger.info("generateAndSave completed", {uid, projectId, generated: testCases.length, saved: ids.length});

    return {
      generated: testCases.length,
      saved: ids.length,
      message: `Generated and saved ${ids.length} test case(s) to project ${projectId}.`,
      testCases: savedTestCases,
    };
  }
);
