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
    throw new HttpsError("permission-denied", "Not a project member");
  }

  const role = String(memberDoc.data()?.role ?? "");
  if (!allowedRoles.includes(role)) {
    throw new HttpsError(
      "permission-denied",
      `Role '${role}' cannot perform this action`
    );
  }
  return role;
}
