import * as admin from "firebase-admin";
import {HttpsError} from "firebase-functions/v2/https";

export async function verifyPermission(
  uid: string,
  projectId: string,
  allowedRoles: string[]
): Promise<string> {
  const memberDoc = await admin
    .firestore()
    .doc(`projects/${projectId}/members/${uid}`)
    .get();

  if (!memberDoc.exists) {
    if (allowedRoles.includes("Owner")) {
      const projectSnap = await admin
        .firestore()
        .doc(`projects/${projectId}`)
        .get();
      const ownerId = String(projectSnap.get("ownerId") ?? "").trim();
      if (projectSnap.exists && ownerId === uid) {
        return "Owner";
      }
    }
    throw new HttpsError("permission-denied", "Not a project member");
  }

  const data = memberDoc.data() || {};
  const status = String(data.status ?? "").trim().toLowerCase();
  if (status === "suspended") {
    throw new HttpsError("permission-denied", "Your account has been suspended.");
  }

  const role = String(data.role ?? "");
  if (!allowedRoles.includes(role)) {
    throw new HttpsError(
      "permission-denied",
      `Role '${role}' cannot perform this action`
    );
  }
  return role;
}
