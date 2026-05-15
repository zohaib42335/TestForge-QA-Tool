import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {TestCase} from "./generateTestCases.js";
import {verifyPermission} from "../utils/rbac.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveGeneratedCasesRequest {
  projectId: string;
  cases: TestCase[];
  suiteId?: string;
  /** Optional: first 200 chars of the feature description, used for the log */
  featureDescription?: string;
}

export interface SavedTestCase extends TestCase {
  id: string;
}

export interface SaveGeneratedCasesResponse {
  saved: number;
  message: string;
  ids: string[];
}

// ---------------------------------------------------------------------------
// Internal save helper — shared with generateAndSave
// ---------------------------------------------------------------------------

/**
 * Writes `cases` into `projects/{projectId}/testCases` using a Firestore batch
 * (chunked at 499 ops to stay under the 500-op limit), then writes a single
 * log document to `projects/{projectId}/aiGenerationLogs`.
 *
 * Returns the list of newly created document IDs.
 */
export async function runSave(
  db: admin.firestore.Firestore,
  uid: string,
  projectId: string,
  cases: TestCase[],
  suiteId: string | null,
  featureDescription?: string
): Promise<string[]> {
  const testCasesCollection = db.collection(`projects/${projectId}/testCases`);
  const logCollection = db.collection(`projects/${projectId}/aiGenerationLogs`);
  const now = FieldValue.serverTimestamp();
  const createdDateIso = new Date().toISOString();

  const normalizeTestSteps = (steps: unknown): string => {
    if (!Array.isArray(steps)) return "";
    const cleaned = steps
      .map((s) => (s == null ? "" : String(s).trim()))
      .filter(Boolean);
    if (cleaned.length === 0) return "";
    return cleaned.map((s, i) => `${i + 1}. ${s}`).join("\n");
  };

  // Pre-generate document refs so we can return IDs without an extra read
  const refs = cases.map(() => testCasesCollection.doc());

  // Chunk into groups of 499 (Firestore batch limit is 500 ops)
  const CHUNK_SIZE = 499;
  const chunks: Array<Array<[admin.firestore.DocumentReference, TestCase]>> = [];

  for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
    const chunk = refs
      .slice(i, i + CHUNK_SIZE)
      .map((ref, j) => [ref, cases[i + j]] as [admin.firestore.DocumentReference, TestCase]);
    chunks.push(chunk);
  }

  // Execute each chunk as its own batch
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const [ref, tc] of chunk) {
      batch.set(ref, {
        // Fields aligned with the client schema (`src/firebase/schema.js`)
        module: "",
        title: tc.title ?? "",
        description: tc.description ?? "",
        preconditions: tc.preconditions ?? "",
        testSteps: normalizeTestSteps((tc as any).steps),
        expectedResult: tc.expectedResult ?? "",
        actualResult: "",
        status: "Not Executed",
        priority: tc.priority ?? "Medium",
        severity: "Medium",
        testType: tc.type ?? "Functional",
        environment: "",
        assignedTo: "",
        createdBy: uid,
        createdDate: createdDateIso,
        executionDate: null,
        comments: "",
        automationStatus: "",
        bugId: "",

        // Metadata
        ownerId: uid,
        projectId: projectId,
        suiteId: suiteId ?? null,
        source: "ai",
        tags: (tc as any).tags ?? [],

        // Timestamps used for ordering in the client (`orderBy('updatedAt','desc')`)
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  // Write the generation log document
  await logCollection.add({
    featureDescription: featureDescription
      ? featureDescription.slice(0, 200)
      : null,
    generatedCount: cases.length,
    savedCount: cases.length,
    createdBy: uid,
    createdAt: now,
  });

  return refs.map((ref) => ref.id);
}

// ---------------------------------------------------------------------------
// Callable Function
// ---------------------------------------------------------------------------

export const saveGeneratedCases = onCall(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<SaveGeneratedCasesResponse> => {
    // -----------------------------------------------------------------------
    // 1. Authentication check
    // -----------------------------------------------------------------------
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to save test cases."
      );
    }
    const uid = request.auth.uid;

    // -----------------------------------------------------------------------
    // 2. Extract & validate input
    // -----------------------------------------------------------------------
    const data = request.data as SaveGeneratedCasesRequest;
    const {projectId, cases, suiteId, featureDescription} = data;

    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "projectId is required and must be a non-empty string."
      );
    }

    if (!Array.isArray(cases) || cases.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "cases must be a non-empty array of test case objects."
      );
    }

    if (cases.length > 20) {
      throw new HttpsError(
        "invalid-argument",
        "cases must contain at most 20 items."
      );
    }

    if (suiteId !== undefined && (typeof suiteId !== "string" || suiteId.trim().length === 0)) {
      throw new HttpsError(
        "invalid-argument",
        "suiteId must be a non-empty string when provided."
      );
    }

    // -----------------------------------------------------------------------
    // 3. Initialise Admin SDK (safe to call multiple times — returns singleton)
    // -----------------------------------------------------------------------
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    const db = admin.firestore();
    await verifyPermission(uid, projectId.trim(), ["Owner", "Admin", "QA Lead"]);

    // -----------------------------------------------------------------------
    // 4. Batch write to Firestore
    // -----------------------------------------------------------------------
    let ids: string[];

    try {
      logger.info("Saving AI-generated test cases", {
        uid,
        projectId,
        count: cases.length,
        hasSuiteId: Boolean(suiteId),
      });

      ids = await runSave(
        db,
        uid,
        projectId.trim(),
        cases,
        suiteId ? suiteId.trim() : null,
        featureDescription
      );

      logger.info("Test cases saved successfully", {uid, projectId, saved: ids.length});
    } catch (err) {
      logger.error("Failed to save test cases to Firestore", {uid, projectId, error: String(err)});
      throw new HttpsError(
        "internal",
        "Failed to save test cases. Please try again."
      );
    }

    // -----------------------------------------------------------------------
    // 5. Return result
    // -----------------------------------------------------------------------
    return {
      saved: ids.length,
      message: `Successfully saved ${ids.length} test case(s) to project ${projectId}.`,
      ids,
    };
  }
);
