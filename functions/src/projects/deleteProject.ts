import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {verifyPermission} from "../utils/rbac.js";

type DeleteProjectRequest = {
  projectId?: string;
};

/**
 * Owner-only: deletes the project document and all subcollections, then clears
 * projectId on member user profiles.
 */
export const deleteProject = onCall(
  {region: "us-central1", timeoutSeconds: 540, memory: "512MiB"},
  async (request): Promise<{ok: true}> => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }
      const uid = request.auth.uid;
      const projectId = String(
        (request.data as DeleteProjectRequest)?.projectId ?? ""
      ).trim();
      if (!projectId) {
        throw new HttpsError("invalid-argument", "projectId is required.");
      }

      if (!admin.apps.length) admin.initializeApp();
      const db = admin.firestore();

      const projectRef = db.doc(`projects/${projectId}`);
      const projectSnap = await projectRef.get();
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project not found.");
      }

      const ownerId = String(projectSnap.get("ownerId") ?? "").trim();
      const isProjectOwner = ownerId !== "" && ownerId === uid;

      if (!isProjectOwner) {
        await verifyPermission(uid, projectId, ["Owner"]);
      } else {
        try {
          await verifyPermission(uid, projectId, ["Owner"]);
        } catch (permErr) {
          if (
            permErr instanceof HttpsError &&
            permErr.code === "permission-denied"
          ) {
            logger.warn(
              "deleteProject: member doc missing Owner role; allowing project ownerId",
              {projectId, uid}
            );
          } else {
            throw permErr;
          }
        }
      }

      const membersSnap = await db
        .collection(`projects/${projectId}/members`)
        .get();
      const memberUids = membersSnap.docs.map((d) => d.id);
      if (!memberUids.includes(uid)) {
        memberUids.push(uid);
      }

      logger.info("deleteProject: deleting workspace", {
        projectId,
        memberCount: memberUids.length,
      });

      await db.recursiveDelete(projectRef);

      const CHUNK = 400;
      for (let i = 0; i < memberUids.length; i += CHUNK) {
        const slice = memberUids.slice(i, i + CHUNK);
        const batch = db.batch();
        for (const muid of slice) {
          batch.set(
            db.doc(`users/${muid}`),
            {
              projectId: null,
              onboardingComplete: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true}
          );
        }
        await batch.commit();
      }

      logger.info("deleteProject: completed", {projectId});
      return {ok: true};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("deleteProject: unexpected error", err);
      const msg =
        err instanceof Error ? err.message : "Could not delete workspace.";
      throw new HttpsError("internal", msg);
    }
  }
);
