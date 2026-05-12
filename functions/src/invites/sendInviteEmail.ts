import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import nodemailer from "nodemailer";

type InviteDoc = {
  email?: string;
  role?: string;
  invitedBy?: string;
  message?: string;
  status?: string;
};

function getWebBaseUrl(): string {
  return process.env.APP_BASE_URL || "http://localhost:5173";
}

function getTransporter() {
  const host = process.env.SMTP_HOST || "";
  const portRaw = process.env.SMTP_PORT || "587";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number.parseInt(portRaw, 10);
  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: {user, pass},
  });
}

export const sendInviteEmail = onDocumentCreated(
  {
    document: "projects/{projectId}/invites/{inviteId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const snap = event.data;
    if (!snap) return;

    const invite = snap.data() as InviteDoc;
    const projectId = String(event.params.projectId || "");
    const inviteId = String(event.params.inviteId || "");
    const email = String(invite?.email || "").trim().toLowerCase();
    const role = String(invite?.role || "Member");
    const invitedBy = String(invite?.invitedBy || "");
    const status = String(invite?.status || "pending");
    const personalMessage = String(invite?.message || "").trim();

    if (!projectId || !inviteId || !email || status !== "pending") {
      return;
    }

    const transporter = getTransporter();
    if (!transporter) {
      logger.warn("Invite email skipped: SMTP env not configured", {projectId, inviteId, email});
      await snap.ref.set(
        {
          emailStatus: "skipped",
          emailError: "SMTP credentials are not configured.",
          emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
      return;
    }

    let inviterName = "A teammate";
    if (invitedBy) {
      try {
        const inviterSnap = await db.doc(`projects/${projectId}/members/${invitedBy}`).get();
        if (inviterSnap.exists) {
          const data = inviterSnap.data() || {};
          inviterName = String(data.displayName || data.email || inviterName);
        }
      } catch (err) {
        logger.warn("Could not fetch inviter display name", {projectId, invitedBy, error: String(err)});
      }
    }

    const baseUrl = getWebBaseUrl().replace(/\/+$/, "");
    const acceptUrl = `${baseUrl}/?invite=${encodeURIComponent(inviteId)}&project=${encodeURIComponent(projectId)}`;
    const fromEmail = process.env.INVITES_FROM_EMAIL || process.env.SMTP_USER || "";

    const subject = `You're invited to TestForge (${role})`;
    const text = [
      `${inviterName} invited you to join a TestForge project as ${role}.`,
      "",
      personalMessage ? `Message: ${personalMessage}` : "",
      `Open TestForge: ${acceptUrl}`,
    ].filter(Boolean).join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin:0 0 12px;">You're invited to TestForge</h2>
        <p style="margin:0 0 8px;"><strong>${inviterName}</strong> invited you as <strong>${role}</strong>.</p>
        ${personalMessage ? `<p style="margin:0 0 8px;"><em>${personalMessage}</em></p>` : ""}
        <p style="margin:16px 0;">
          <a href="${acceptUrl}" style="background:#1A3263;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;">
            Open Invitation
          </a>
        </p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject,
        text,
        html,
      });

      await snap.ref.set(
        {
          emailStatus: "sent",
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
      logger.info("Invite email sent", {projectId, inviteId, email});
    } catch (err) {
      logger.error("Failed to send invite email", {projectId, inviteId, email, error: String(err)});
      await snap.ref.set(
        {
          emailStatus: "failed",
          emailError: String(err),
          emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
    }
  }
);

