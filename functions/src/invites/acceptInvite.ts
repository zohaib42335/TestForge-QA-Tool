import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";

type AcceptInviteRequest = {
  token?: string;
};

type AcceptInviteResponse = {
  projectId: string;
  role: string;
  projectName: string;
};

function lowerEmail(v: unknown): string {
  if (v == null || typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

export const acceptInvite = onCall(
  {region: "us-central1", timeoutSeconds: 60, memory: "256MiB"},
  async (request): Promise<AcceptInviteResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const token = String((request.data as AcceptInviteRequest)?.token ?? "").trim();
    if (!token) {
      throw new HttpsError("invalid-argument", "token is required.");
    }

    const authEmail = lowerEmail(request.auth.token?.email);

    if (!admin.apps.length) {
      admin.initializeApp();
    }
    const db = admin.firestore();

    const cgSnap = await db
      .collectionGroup("invites")
      .where("token", "==", token)
      .limit(10)
      .get();

    if (cgSnap.empty) {
      throw new HttpsError("not-found", "Invite not found.");
    }

    const now = Timestamp.now();
    let chosen: (typeof cgSnap.docs[number]) | null = null;

    for (const d of cgSnap.docs) {
      const st = String(d.get("status") ?? "");
      if (st !== "pending") continue;
      const exp = d.get("expiresAt") as Timestamp | undefined;
      if (exp instanceof Timestamp && exp.toMillis() <= now.toMillis()) {
        continue;
      }
      chosen = d;
      break;
    }

    if (!chosen) {
      throw new HttpsError(
        "failed-precondition",
        "This invite is no longer valid or has expired."
      );
    }

    const inviteData = chosen.data() || {};
    const openInvite = inviteData.openInvite === true;
    const inviteEmail = lowerEmail(inviteData.email);

    if (!openInvite) {
      if (!authEmail) {
        throw new HttpsError(
          "permission-denied",
          "This invite was sent to a different email address"
        );
      }
      if (inviteEmail !== authEmail) {
        throw new HttpsError(
          "permission-denied",
          "This invite was sent to a different email address"
        );
      }
    }

    const pathParts = chosen.ref.path.split("/");
    const projectId = pathParts.length >= 2 ? pathParts[1] : "";
    if (!projectId) {
      throw new HttpsError("failed-precondition", "Invalid invite path.");
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const existingPid = userSnap.exists
      ? userSnap.get("projectId")
      : null;
    if (
      existingPid != null &&
      String(existingPid).trim() !== ""
    ) {
      throw new HttpsError(
        "failed-precondition",
        "You already belong to a project"
      );
    }

    const roleRaw = String(inviteData.role ?? "Member");
    const role =
      roleRaw === "Owner" ||
      roleRaw === "Admin" ||
      roleRaw === "QA Lead" ||
      roleRaw === "Member" ||
      roleRaw === "Viewer"
        ? roleRaw
        : "Member";

    const projectRef = db.doc(`projects/${projectId}`);
    const projectSnap = await projectRef.get();
    const projectName = projectSnap.exists
      ? String(projectSnap.get("name") ?? "").trim() || "Project"
      : "Project";

    const memberRef = db.doc(`projects/${projectId}/members/${uid}`);
    const displayName =
      userSnap.exists && String(userSnap.get("displayName") ?? "").trim() !== ""
        ? String(userSnap.get("displayName"))
        : String(request.auth.token?.name ?? "").trim() !== ""
          ? String(request.auth.token?.name)
          : authEmail || "Member";

    const batch = db.batch();
    batch.set(memberRef, {
      uid,
      email: request.auth.token?.email ?? "",
      displayName,
      photoURL: request.auth.token?.picture ?? null,
      role,
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      invitedBy: inviteData.invitedBy ?? null,
      status: "active",
      inviteId: chosen.id,
    });

    batch.set(
      userRef,
      {
        projectId,
        role,
        onboardingComplete: true,
        lastLoginAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    batch.set(
      chosen.ref,
      {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    await batch.commit();

    return {projectId, role, projectName};
  }
);
