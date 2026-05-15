/**
 * @fileoverview JIRA Integration Cloud Functions.
 *
 * Callable functions for connecting TestForge bugs to JIRA:
 * - testJiraConnection: Verify JIRA credentials
 * - createJiraIssue: Push a TestForge bug to JIRA
 * - syncBugStatusFromJira: Pull JIRA status back into TestForge
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {verifyPermission} from "../utils/rbac.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JiraConfig {
  enabled: boolean;
  jiraBaseUrl: string;
  jiraProjectKey: string;
  jiraEmail: string;
  jiraApiToken: string;
  defaultIssueType: string;
  defaultPriority: string;
  autoSync: boolean;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Initialize Admin SDK if not already done.
 * @return {admin.firestore.Firestore} Firestore instance
 */
function ensureApp(): admin.firestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/**
 * Read and validate JIRA config from Firestore.
 * @param {admin.firestore.Firestore} db Firestore instance
 * @param {string} projectId Project (owner uid)
 * @return {Promise<JiraConfig>} Validated JIRA config
 */
async function getJiraConfig(
  db: admin.firestore.Firestore,
  projectId: string
): Promise<JiraConfig> {
  const snap = await db
    .doc(`projects/${projectId}/integrations/jira`)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "JIRA integration is not configured for this project."
    );
  }
  const cfg = snap.data() as JiraConfig;
  if (!cfg.enabled) {
    throw new HttpsError(
      "failed-precondition",
      "JIRA integration is disabled for this project."
    );
  }
  if (!cfg.jiraBaseUrl || !cfg.jiraEmail || !cfg.jiraApiToken) {
    throw new HttpsError(
      "failed-precondition",
      "JIRA configuration is incomplete. Please update your settings."
    );
  }
  return cfg;
}

/**
 * Build the Basic Auth header value for JIRA API calls.
 * @param {string} email Atlassian account email
 * @param {string} token Atlassian API token
 * @return {string} Authorization header value
 */
function jiraAuthHeader(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Map TestForge bug severity to a JIRA priority name.
 * @param {string} severity TestForge severity value
 * @return {string} JIRA priority name
 */
function mapSeverityToJiraPriority(severity: string): string {
  switch (severity) {
  case "Critical":
    return "Highest";
  case "High":
    return "High";
  case "Medium":
    return "Medium";
  case "Low":
    return "Low";
  default:
    return "Medium";
  }
}

/**
 * Map a JIRA status name to a TestForge status value.
 * @param {string} jiraStatus Status name from JIRA API
 * @return {string} TestForge status value
 */
function mapJiraStatusToTestForge(jiraStatus: string): string {
  const s = jiraStatus.toLowerCase();
  if (s === "to do" || s === "open" || s === "backlog") return "Open";
  if (s === "in progress" || s === "in review") return "In Progress";
  if (s === "done" || s === "resolved") return "Fixed";
  if (s === "closed") return "Closed";
  if (s === "won't do" || s === "won't fix" || s === "rejected") {
    return "Won't Fix";
  }
  return "Open";
}

/**
 * Build an Atlassian Document Format (ADF) description node.
 * @param {{
 *   description?: string,
 *   stepsToReproduce?: string[],
 *   bugId?: string
 * }} bug Bug data fields
 * @return {object} ADF doc node
 */
function buildAdfDescription(bug: {
  description?: string;
  stepsToReproduce?: string[];
  bugId?: string;
}): object {
  const content: object[] = [];

  if (bug.description) {
    content.push({
      type: "paragraph",
      content: [{type: "text", text: bug.description}],
    });
  }

  if (
    Array.isArray(bug.stepsToReproduce) &&
    bug.stepsToReproduce.length > 0
  ) {
    content.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Steps to Reproduce:",
          marks: [{type: "strong"}],
        },
      ],
    });
    content.push({
      type: "bulletList",
      content: bug.stepsToReproduce.map((step: string) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{type: "text", text: step}],
          },
        ],
      })),
    });
  }

  content.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `Reported from TestForge | Bug ID: ${bug.bugId ?? "N/A"}`,
        marks: [{type: "em"}],
      },
    ],
  });

  return {type: "doc", version: 1, content};
}

// ---------------------------------------------------------------------------
// 1. testJiraConnection
// ---------------------------------------------------------------------------

export const testJiraConnection = onCall(
  {timeoutSeconds: 30, memory: "256MiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = request.auth.uid;
    const {projectId} = request.data as {projectId: string};
    if (!projectId) {
      throw new HttpsError("invalid-argument", "projectId is required.");
    }

    const db = ensureApp();
    await verifyPermission(uid, projectId, ["Owner", "Admin"]);
    const cfg = await getJiraConfig(db, projectId);
    const base = cfg.jiraBaseUrl.replace(/\/+$/, "");
    const url = `${base}/rest/api/3/myself`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: jiraAuthHeader(cfg.jiraEmail, cfg.jiraApiToken),
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text();
        logger.warn("JIRA connection test failed", {
          status: res.status,
          body,
        });
        return {
          success: false,
          error: `JIRA returned ${res.status}: ${body.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {displayName?: string};
      return {
        success: true,
        accountName: data.displayName ?? "Unknown",
      };
    } catch (err) {
      logger.error("testJiraConnection: network error", {
        error: String(err),
      });
      return {
        success: false,
        error: `Network error: ${String(err)}`,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// 2. createJiraIssue
// ---------------------------------------------------------------------------

export const createJiraIssue = onCall(
  {timeoutSeconds: 60, memory: "256MiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const uid = request.auth.uid;
    const {projectId, bugId} = request.data as {
      projectId: string;
      bugId: string;
    };

    if (!projectId) {
      throw new HttpsError("invalid-argument", "projectId is required.");
    }
    if (!bugId) {
      throw new HttpsError("invalid-argument", "bugId is required.");
    }

    const db = ensureApp();
    await verifyPermission(uid, projectId, ["Owner", "Admin", "QA Lead"]);
    const cfg = await getJiraConfig(db, projectId);

    const bugRef = db.doc(`projects/${projectId}/bugs/${bugId}`);
    const bugSnap = await bugRef.get();
    if (!bugSnap.exists) {
      throw new HttpsError("not-found", `Bug '${bugId}' not found.`);
    }
    const bug = bugSnap.data() as {
      title?: string;
      description?: string;
      stepsToReproduce?: string[];
      severity?: string;
      tags?: string[];
      bugId?: string;
      jiraIssueKey?: string;
    };

    if (bug.jiraIssueKey) {
      const base = cfg.jiraBaseUrl.replace(/\/+$/, "");
      return {
        jiraIssueKey: bug.jiraIssueKey,
        jiraIssueUrl: `${base}/browse/${bug.jiraIssueKey}`,
        alreadyExists: true,
      };
    }

    const baseUrl = cfg.jiraBaseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/rest/api/3/issue`;

    const labels = ["TestForge"];
    if (Array.isArray(bug.tags)) {
      for (const t of bug.tags) {
        if (typeof t === "string" && t.trim()) {
          labels.push(t.trim().replace(/\s+/g, "-"));
        }
      }
    }

    const payload = {
      fields: {
        project: {key: cfg.jiraProjectKey},
        summary: bug.title ?? "Untitled Bug",
        description: buildAdfDescription(bug),
        issuetype: {name: cfg.defaultIssueType || "Bug"},
        priority: {
          name: mapSeverityToJiraPriority(bug.severity ?? "Medium"),
        },
        labels,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: jiraAuthHeader(cfg.jiraEmail, cfg.jiraApiToken),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error("createJiraIssue: JIRA API error", {
          status: res.status,
          body,
          uid,
          projectId,
          bugId,
        });
        throw new HttpsError(
          "internal",
          `JIRA issue creation failed (${res.status}): ${body.slice(0, 300)}`
        );
      }

      const data = (await res.json()) as {key?: string; self?: string};
      const issueKey = data.key ?? "";
      const issueUrl = `${baseUrl}/browse/${issueKey}`;

      await bugRef.update({
        jiraIssueKey: issueKey,
        jiraIssueUrl: issueUrl,
        jiraSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info("createJiraIssue: success", {
        uid,
        projectId,
        bugId,
        issueKey,
      });

      return {jiraIssueKey: issueKey, jiraIssueUrl: issueUrl};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("createJiraIssue: network error", {error: String(err)});
      throw new HttpsError(
        "internal",
        `Failed to create JIRA issue: ${String(err)}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// 3. syncBugStatusFromJira
// ---------------------------------------------------------------------------

export const syncBugStatusFromJira = onCall(
  {timeoutSeconds: 30, memory: "256MiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = request.auth.uid;
    const {projectId, bugId} = request.data as {
      projectId: string;
      bugId: string;
    };

    if (!projectId || !bugId) {
      throw new HttpsError(
        "invalid-argument",
        "projectId and bugId are required."
      );
    }

    const db = ensureApp();
    await verifyPermission(uid, projectId, [
      "Owner",
      "Admin",
      "QA Lead",
      "Member",
    ]);
    const cfg = await getJiraConfig(db, projectId);

    const bugRef = db.doc(`projects/${projectId}/bugs/${bugId}`);
    const bugSnap = await bugRef.get();
    if (!bugSnap.exists) {
      throw new HttpsError("not-found", `Bug '${bugId}' not found.`);
    }
    const bug = bugSnap.data() as {jiraIssueKey?: string};
    if (!bug.jiraIssueKey) {
      throw new HttpsError(
        "failed-precondition",
        "This bug is not linked to a JIRA issue."
      );
    }

    const baseUrl = cfg.jiraBaseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/rest/api/3/issue/${bug.jiraIssueKey}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: jiraAuthHeader(cfg.jiraEmail, cfg.jiraApiToken),
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new HttpsError(
          "internal",
          `JIRA API error (${res.status}): ${body.slice(0, 200)}`
        );
      }

      const data = (await res.json()) as {
        fields?: {status?: {name?: string}};
      };
      const jiraStatus = data.fields?.status?.name ?? "Unknown";
      const testForgeStatus = mapJiraStatusToTestForge(jiraStatus);

      await bugRef.update({
        status: testForgeStatus,
        jiraSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info("syncBugStatusFromJira: success", {
        projectId,
        bugId,
        jiraStatus,
        testForgeStatus,
      });

      return {jiraStatus, testForgeStatus};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("syncBugStatusFromJira: network error", {
        error: String(err),
      });
      throw new HttpsError(
        "internal",
        `Failed to sync from JIRA: ${String(err)}`
      );
    }
  }
);
