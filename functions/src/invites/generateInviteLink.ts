import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {randomUUID} from "crypto";
import {verifyPermission} from "../utils/rbac.js";

const INVITE_ROLES = new Set(["Admin", "QA Lead", "Member", "Viewer"]);
const OWNER_INVITE_ROLES = new Set(["Admin", "QA Lead", "Member", "Viewer"]);
const ADMIN_INVITE_ROLES = new Set(["QA Lead", "Member", "Viewer"]);

function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.APP_BASE_URL ||
    "https://testforge.app"
  ).replace(/\/+$/, "");
}

function normalizeRole(role: unknown): string {
  const r = String(role ?? "").trim();
  if (r === "Tester") return "Member";
  return INVITE_ROLES.has(r) ? r : "Member";
}

function roleAllowedForInviter(inviterRole: string, targetRole: string): boolean {
  if (inviterRole === "Owner") return OWNER_INVITE_ROLES.has(targetRole);
  if (inviterRole === "Admin") return ADMIN_INVITE_ROLES.has(targetRole);
  return false;
}

type GenerateInviteRequest = {
  projectId?: string;
  email?: string | null;
  role?: string;
};

type GenerateInviteResponse = {
  inviteLink: string;
  token: string;
};

export const generateInviteLink = onCall(
  {region: "us-central1", timeoutSeconds: 60, memory: "256MiB"},
  async (request): Promise<GenerateInviteResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const data = request.data as GenerateInviteRequest;
    const projectId =
      typeof data.projectId === "string" ? data.projectId.trim() : "";
    const role = normalizeRole(data.role);

    if (!projectId) {
      throw new HttpsError("invalid-argument", "projectId is required.");
    }

    const inviterRole = await verifyPermission(uid, projectId, ["Owner", "Admin"]);
    if (!roleAllowedForInviter(inviterRole, role)) {
      throw new HttpsError(
        "permission-denied",
        "You cannot assign this role with your current access."
      );
    }

    const rawEmail = data.email;
    const normalizedEmail =
      rawEmail == null || String(rawEmail).trim() === ""
        ? null
        : String(rawEmail).trim().toLowerCase();

    if (!admin.apps.length) {
      admin.initializeApp();
    }
    const db = admin.firestore();
    const invitesCol = db.collection(`projects/${projectId}/invites`);

    if (normalizedEmail) {
      const membersSnap = await db
        .collection(`projects/${projectId}/members`)
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();
      if (!membersSnap.empty) {
        throw new HttpsError(
          "already-exists",
          "User is already a member"
        );
      }

      const pendingSnap = await invitesCol
        .where("email", "==", normalizedEmail)
        .where("status", "==", "pending")
        .limit(1)
        .get();
      if (!pendingSnap.empty) {
        const docSnap = pendingSnap.docs[0];
        const token = String(docSnap.get("token") ?? "").trim();
        if (!token) {
          throw new HttpsError(
            "failed-precondition",
            "Pending invite is missing token."
          );
        }
        const base = getAppUrl();
        return {inviteLink: `${base}/invite/${token}`, token};
      }
    }

    const [projectSnap, inviterMemberSnap] = await Promise.all([
      db.doc(`projects/${projectId}`).get(),
      db.doc(`projects/${projectId}/members/${uid}`).get(),
    ]);

    const projectName = projectSnap.exists
      ? String(projectSnap.get("name") ?? "").trim()
      : "";
    const inviterName = inviterMemberSnap.exists
      ? String(
        inviterMemberSnap.get("displayName") ??
            inviterMemberSnap.get("email") ??
            ""
      ).trim()
      : "";

    const token = randomUUID();
    const nowMs = Date.now();
    const expiresAt = Timestamp.fromMillis(nowMs + 7 * 24 * 60 * 60 * 1000);
    const openInvite = normalizedEmail == null;

    const inviteBody: Record<string, unknown> = {
      token,
      email: normalizedEmail,
      openInvite,
      role,
      invitedBy: uid,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt,
      status: "pending",
    };
    if (projectName) inviteBody.projectName = projectName;
    if (inviterName) inviteBody.invitedByName = inviterName;

    await invitesCol.add(inviteBody);

    const base = getAppUrl();
    return {
      inviteLink: `${base}/invite/${token}`,
      token,
    };
  }
);
