import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {verifyPermission} from "../utils/rbac.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoCreateBugRequest {
  projectId: string;
  testCaseId: string;
  testRunId: string;
  title?: string;
  severity?: "Critical" | "High" | "Medium" | "Low";
}

export interface AutoCreateBugResponse {
  bugId: string;   // e.g. "BUG-003"
  docId: string;   // Firestore document ID
}

/** Maps test case priority to a default bug severity. */
const PRIORITY_TO_SEVERITY: Record<string, "Critical" | "High" | "Medium" | "Low"> = {
  Critical: "Critical",
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-pads a number to at least 3 digits: 1 → "001", 42 → "042". */
function padBugNumber(n: number): string {
  return String(n).padStart(3, "0");
}

// ---------------------------------------------------------------------------
// Callable: autoCreateBug
// ---------------------------------------------------------------------------

export const autoCreateBug = onCall(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<AutoCreateBugResponse> => {
    // -----------------------------------------------------------------------
    // 1. Auth guard
    // -----------------------------------------------------------------------
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to create a bug."
      );
    }
    const uid = request.auth.uid;

    // -----------------------------------------------------------------------
    // 2. Validate input
    // -----------------------------------------------------------------------
    const data = request.data as AutoCreateBugRequest;
    const {projectId, testCaseId, testRunId, title, severity} = data;

    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "projectId is required.");
    }
    if (!testCaseId || typeof testCaseId !== "string" || testCaseId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "testCaseId is required.");
    }
    if (!testRunId || typeof testRunId !== "string" || testRunId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "testRunId is required.");
    }
    if (
      severity !== undefined &&
      !["Critical", "High", "Medium", "Low"].includes(severity)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "severity must be one of: Critical, High, Medium, Low."
      );
    }

    // -----------------------------------------------------------------------
    // 3. Init Admin SDK
    // -----------------------------------------------------------------------
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    await verifyPermission(uid, projectId.trim(), ["Owner", "Admin", "QA Lead", "Member"]);

    // -----------------------------------------------------------------------
    // 4. Load the test case document
    // -----------------------------------------------------------------------
    const testCaseRef = db.doc(`projects/${projectId.trim()}/testCases/${testCaseId.trim()}`);
    let testCaseSnap: admin.firestore.DocumentSnapshot;

    try {
      testCaseSnap = await testCaseRef.get();
    } catch (err) {
      logger.error("Failed to fetch test case", {uid, projectId, testCaseId, error: String(err)});
      throw new HttpsError("internal", "Failed to fetch the test case. Please try again.");
    }

    if (!testCaseSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Test case '${testCaseId}' does not exist in project '${projectId}'.`
      );
    }

    const tc = testCaseSnap.data() as {
      title?: string;
      steps?: string[];
      expectedResult?: string;
      priority?: string;
    };

    // -----------------------------------------------------------------------
    // 5. Auto-generate bugId (BUG-XXX) using a transaction for safety
    // -----------------------------------------------------------------------
    const bugsCollection = db.collection(`projects/${projectId.trim()}/bugs`);

    let bugId: string;
    let newDocRef: admin.firestore.DocumentReference;
    const now = FieldValue.serverTimestamp();
    const resolvedTitle = title?.trim() || `Bug: ${(tc.title ?? "Unknown test case")} failed`;
    const resolvedSeverity: "Critical" | "High" | "Medium" | "Low" =
      severity ?? PRIORITY_TO_SEVERITY[tc.priority ?? ""] ?? "Medium";

    try {
      await db.runTransaction(async (txn) => {
        // Count existing bugs to determine the next number
        // We read the collection inside the transaction using a query snapshot
        const existingSnap = await txn.get(bugsCollection);
        const nextNumber = existingSnap.size + 1;
        bugId = `BUG-${padBugNumber(nextNumber)}`;

        // Prepare new bug document ref
        newDocRef = bugsCollection.doc();

        // Write the bug document
        txn.set(newDocRef, {
          bugId,
          title: resolvedTitle,
          description: tc.title
            ? `Automated bug created from failed test case: "${tc.title}".`
            : "Automated bug created from a failed test case.",
          stepsToReproduce: tc.steps ?? [],
          severity: resolvedSeverity,
          status: "Open",
          priority: resolvedSeverity,
          linkedTestCaseIds: [testCaseId.trim()],
          linkedTestRunId: testRunId.trim(),
          environment: "Unknown",
          assignedTo: null,
          reportedBy: uid,
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
          tags: [],
          attachments: [],
        });

        // Update the test case: append this bugId to linkedBugIds array
        txn.update(testCaseRef, {
          linkedBugIds: FieldValue.arrayUnion(bugId),
          updatedAt: now,
        });
      });
    } catch (err) {
      logger.error("autoCreateBug: transaction failed", {uid, projectId, testCaseId, error: String(err)});
      throw new HttpsError("internal", "Failed to create bug. Please try again.");
    }

    logger.info("autoCreateBug: bug created successfully", {
      uid,
      projectId,
      bugId: bugId!,
      docId: newDocRef!.id,
      testCaseId,
      testRunId,
    });

    return {
      bugId: bugId!,
      docId: newDocRef!.id,
    };
  }
);
