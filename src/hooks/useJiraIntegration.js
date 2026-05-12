/**
 * @fileoverview Hook for JIRA integration.
 *
 * Config is stored in Firestore at projects/{projectId}/integrations/jira.
 * All JIRA REST API v3 calls are made directly from the browser using
 * Basic Auth (base64(email:apiToken)) — no Cloud Functions required.
 *
 * CORS note: JIRA Cloud allows browser-side calls. If you hit CORS errors
 * in production, deploy a thin Cloudflare Worker proxy (free tier).
 */

import { useCallback, useState } from 'react'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import { getDb } from '../firebase/firestore.js'

// ---------------------------------------------------------------------------
// Types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} JiraConfig
 * @property {boolean} enabled
 * @property {string} jiraBaseUrl
 * @property {string} jiraProjectKey
 * @property {string} jiraEmail
 * @property {string} jiraApiToken
 * @property {string} defaultIssueType
 * @property {string} defaultPriority
 * @property {boolean} autoSync
 * @property {string} [proxyUrl]  — optional Cloudflare Worker URL for CORS proxy
 * @property {string} [createdBy]
 */

/** @type {JiraConfig} */
const DEFAULT_CONFIG = {
  enabled: false,
  jiraBaseUrl: '',
  jiraProjectKey: '',
  jiraEmail: '',
  jiraApiToken: '',
  defaultIssueType: 'Bug',
  defaultPriority: 'High',
  autoSync: false,
  proxyUrl: '',
}

// ---------------------------------------------------------------------------
// Pure helpers (no React, safe to use outside components)
// ---------------------------------------------------------------------------

/**
 * Build a Basic Auth header value from JIRA credentials.
 * @param {string} email
 * @param {string} token
 * @returns {string}
 */
function buildBasicAuth(email, token) {
  return 'Basic ' + btoa(`${email}:${token}`)
}

/**
 * Parse a JIRA error response body into a human-readable string.
 * JIRA v3 errors come back as { errorMessages: string[], errors: Record<string,string> }
 * @param {string} bodyText
 * @param {number} status
 * @returns {string}
 */
function parseJiraError(bodyText, status) {
  // Try to extract JIRA's own error messages first — they are the most specific
  let jiraMessage = ''
  try {
    const json = JSON.parse(bodyText)
    const msgs = /** @type {string[]} */ (json.errorMessages ?? [])
    const fieldErrs = Object.values(json.errors ?? {}).filter(Boolean)
    jiraMessage = [...msgs, ...fieldErrs].join('; ')
  } catch { /* not JSON, use raw text */ }

  if (status === 401) {
    const detail = jiraMessage ? ` (${jiraMessage})` : ''
    return `Authentication failed — check your email and API token.${detail}`
  }

  if (status === 403) {
    // Show JIRA's own message if it has one, otherwise give the actionable hint
    if (jiraMessage) {
      return `JIRA denied the request (403): ${jiraMessage} — if your API token recently expired, ` +
        'regenerate it at id.atlassian.com → Security → API Tokens.'
    }
    return 'Permission denied (403) — your account may lack "Create Issues" permission on this ' +
      'JIRA project, or the API token is expired. Check: id.atlassian.com → Security → API Tokens.'
  }

  if (jiraMessage) return `JIRA error (${status}): ${jiraMessage}`
  return `JIRA returned ${status}: ${bodyText.slice(0, 300)}`
}

/**
 * Strip trailing slashes from a URL.
 * @param {string} url
 * @returns {string}
 */
function trimUrl(url) {
  return url.replace(/\/+$/, '')
}

/**
 * Build the request URL and headers for a JIRA API call.
 * If proxyUrl is set, routes through the Cloudflare Worker proxy;
 * otherwise calls JIRA directly (works on localhost, may hit CORS in prod).
 * @param {string} jiraPath  — e.g. '/rest/api/3/myself'
 * @param {JiraConfig} cfg
 * @returns {{ url: string, extraHeaders: Record<string, string> }}
 */
function buildJiraRequest(jiraPath, cfg) {
  const base = trimUrl(cfg.jiraBaseUrl)
  if (cfg.proxyUrl && cfg.proxyUrl.trim()) {
    // Route through Cloudflare Worker: worker URL + JIRA path
    const proxyBase = trimUrl(cfg.proxyUrl.trim())
    return {
      url: proxyBase + jiraPath,
      extraHeaders: { 'X-Jira-Base-Url': base },
    }
  }
  // Direct call
  return { url: base + jiraPath, extraHeaders: {} }
}

/**
 * Map TestForge severity → JIRA priority name.
 * @param {string} severity
 * @returns {string}
 */
function severityToJiraPriority(severity) {
  const map = { Critical: 'Highest', High: 'High', Medium: 'Medium', Low: 'Low' }
  return map[severity] ?? 'Medium'
}

/**
 * Map JIRA status name → TestForge status.
 * @param {string} jiraStatus
 * @returns {string}
 */
function jiraStatusToTestForge(jiraStatus) {
  const s = jiraStatus.toLowerCase()
  if (s === 'to do' || s === 'open' || s === 'backlog') return 'Open'
  if (s === 'in progress' || s === 'in review') return 'In Progress'
  if (s === 'done' || s === 'resolved') return 'Fixed'
  if (s === 'closed') return 'Closed'
  if (s === "won't do" || s === "won't fix" || s === 'rejected') return "Won't Fix"
  return 'Open'
}

/**
 * Build an Atlassian Document Format (ADF) description node.
 * @param {{ description?: string, stepsToReproduce?: string[], bugId?: string }} bug
 * @returns {object}
 */
function buildAdf(bug) {
  const content = []

  if (bug.description) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: bug.description }],
    })
  }

  if (Array.isArray(bug.stepsToReproduce) && bug.stepsToReproduce.length > 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Steps to Reproduce:', marks: [{ type: 'strong' }] }],
    })
    content.push({
      type: 'bulletList',
      content: bug.stepsToReproduce.map((step) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: step }] }],
      })),
    })
  }

  content.push({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: `Reported from TestForge | Bug ID: ${bug.bugId ?? 'N/A'}`,
      marks: [{ type: 'em' }],
    }],
  })

  return { type: 'doc', version: 1, content }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useJiraIntegration() {
  const { user } = useAuth()

  const [config, setConfig] = useState(/** @type {JiraConfig | null} */ (null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(/** @type {string | null} */ (null))

  // -------------------------------------------------------------------------
  // fetchConfig — read JIRA settings from Firestore
  // -------------------------------------------------------------------------
  const fetchConfig = useCallback(
    /** @param {string} projectId */
    async (projectId) => {
      const db = getDb()
      if (!db) return null
      setLoading(true)
      setError(null)
      try {
        const ref = doc(db, `projects/${projectId}/integrations/jira`)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const data = /** @type {JiraConfig} */ ({ ...DEFAULT_CONFIG, ...snap.data() })
          setConfig(data)
          return data
        }
        setConfig(null)
        return null
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load JIRA config.')
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // saveConfig — write JIRA settings to Firestore
  // -------------------------------------------------------------------------
  const saveConfig = useCallback(
    /**
     * @param {string} projectId
     * @param {Partial<JiraConfig>} cfg
     */
    async (projectId, cfg) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      const uid = user?.uid
      if (!uid) throw new Error('Not signed in.')

      setLoading(true)
      setError(null)
      try {
        const ref = doc(db, `projects/${projectId}/integrations/jira`)
        const payload = {
          ...DEFAULT_CONFIG,
          ...cfg,
          createdBy: uid,
          updatedAt: serverTimestamp(),
        }
        await setDoc(ref, payload, { merge: true })
        setConfig(/** @type {JiraConfig} */ (payload))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save.'
        setError(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [user?.uid],
  )

  // -------------------------------------------------------------------------
  // testConnection — GET /rest/api/3/myself directly from browser
  // -------------------------------------------------------------------------
  const testConnection = useCallback(
    /** @param {string} projectId */
    async (projectId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore not available.')

      // Re-read config fresh so we test the latest saved values
      const ref = doc(db, `projects/${projectId}/integrations/jira`)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('JIRA is not configured.')
      const cfg = /** @type {JiraConfig} */ ({ ...DEFAULT_CONFIG, ...snap.data() })

      const authHeaders = {
        Authorization: buildBasicAuth(cfg.jiraEmail, cfg.jiraApiToken),
        Accept: 'application/json',
      }

      // ── Step 1: verify credentials via /myself ──────────────────────────────
      const { url: myselfUrl, extraHeaders } = buildJiraRequest('/rest/api/3/myself', cfg)
      let accountName = 'Unknown'

      try {
        const res = await fetch(myselfUrl, {
          method: 'GET',
          headers: { ...authHeaders, ...extraHeaders },
        })

        if (!res.ok) {
          const body = await res.text()
          console.error('[JIRA testConnection] /myself non-OK', { status: res.status, url: myselfUrl, body })
          return { success: false, error: parseJiraError(body, res.status) }
        }

        const me = /** @type {{ displayName?: string }} */ (await res.json())
        accountName = me.displayName ?? 'Unknown'
      } catch (err) {
        console.error('[JIRA testConnection] /myself fetch failed', { url: myselfUrl, error: err })
        const isProxyErr = cfg.proxyUrl && cfg.proxyUrl.trim()
        const hint = isProxyErr
          ? ' Check the Proxy URL is correct and the worker is redeployed.'
          : ' (tip: add a Proxy URL in Settings to fix CORS in production)'
        return { success: false, error: `Network error — ${String(err)}.${hint}` }
      }

      // ── Step 2: verify project access (only if a project key is configured) ─
      if (cfg.jiraProjectKey && cfg.jiraProjectKey.trim()) {
        const { url: projUrl, extraHeaders: projHeaders } =
          buildJiraRequest(`/rest/api/3/project/${cfg.jiraProjectKey.trim().toUpperCase()}`, cfg)

        try {
          const projRes = await fetch(projUrl, {
            method: 'GET',
            headers: { ...authHeaders, ...projHeaders },
          })

          if (!projRes.ok) {
            const body = await projRes.text()
            console.error('[JIRA testConnection] /project non-OK', { status: projRes.status, url: projUrl, body })
            if (projRes.status === 404) {
              return {
                success: false,
                error: `Authenticated as ${accountName} ✓ but project key ` +
                  `"${cfg.jiraProjectKey.trim().toUpperCase()}" was not found. ` +
                  'Check the Project Key in Settings (e.g. use "QA", not "QA Board").'
              }
            }
            return {
              success: false,
              error: `Authenticated as ${accountName} ✓ but cannot access project ` +
                `"${cfg.jiraProjectKey.trim().toUpperCase()}": ${parseJiraError(body, projRes.status)}`
            }
          }
        } catch (err) {
          console.error('[JIRA testConnection] /project fetch failed', { url: projUrl, error: err })
          // Non-fatal — at least auth works
          return {
            success: true,
            accountName,
            error: `Credentials OK but could not verify project access: ${String(err)}`,
          }
        }
      }

      return { success: true, accountName }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // createIssue — POST /rest/api/3/issue + update Firestore bug doc
  // -------------------------------------------------------------------------
  const createIssue = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId — Firestore document ID of the bug
     * @returns {Promise<{ jiraIssueKey: string, jiraIssueUrl: string, alreadyExists?: boolean }>}
     */
    async (projectId, bugDocId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore not available.')

      // Load JIRA config
      const cfgSnap = await getDoc(doc(db, `projects/${projectId}/integrations/jira`))
      if (!cfgSnap.exists()) throw new Error('JIRA is not configured.')
      const cfg = /** @type {JiraConfig} */ (cfgSnap.data())
      if (!cfg.enabled) throw new Error('JIRA integration is disabled.')

      // Load bug document
      const bugRef = doc(db, `projects/${projectId}/bugs/${bugDocId}`)
      const bugSnap = await getDoc(bugRef)
      if (!bugSnap.exists()) throw new Error(`Bug '${bugDocId}' not found.`)
      const bug = /** @type {any} */ (bugSnap.data())

      // Return early if already linked
      if (bug.jiraIssueKey) {
        const issueUrl = `${trimUrl(cfg.jiraBaseUrl)}/browse/${bug.jiraIssueKey}`
        return { jiraIssueKey: bug.jiraIssueKey, jiraIssueUrl: issueUrl, alreadyExists: true }
      }

      // Build labels (JIRA labels can't contain spaces)
      const labels = ['TestForge']
      if (Array.isArray(bug.tags)) {
        for (const t of bug.tags) {
          if (typeof t === 'string' && t.trim()) labels.push(t.trim().replace(/\s+/g, '-'))
        }
      }

      const baseUrl = trimUrl(cfg.jiraBaseUrl)

      // Minimal required fields — always safe
      const requiredFields = {
        project: { key: cfg.jiraProjectKey },
        summary: bug.title ?? 'Untitled Bug',
        issuetype: { name: cfg.defaultIssueType || 'Bug' },
      }

      // Optional fields — not all JIRA projects have these on their issue screen
      const optionalFields = {
        description: buildAdf(bug),
        priority: { name: severityToJiraPriority(bug.severity ?? 'Medium') },
        labels,
      }

      // Try with all fields first; fall back to required-only on 403/400
      const payload = { fields: { ...requiredFields, ...optionalFields } }

      const { url: issueUrl2, extraHeaders: postHeaders } =
        buildJiraRequest('/rest/api/3/issue', cfg)

      const postHeaders2 = {
        Authorization: buildBasicAuth(cfg.jiraEmail, cfg.jiraApiToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Atlassian-Token': 'no-check',
        ...postHeaders,
      }

      let res = await fetch(issueUrl2, {
        method: 'POST',
        headers: postHeaders2,
        body: JSON.stringify(payload),
      })

      // On 403/400 the optional fields (priority, labels, description) may not be
      // configured on this project's issue screen — retry with required fields only
      if (!res.ok && (res.status === 403 || res.status === 400)) {
        const firstBody = await res.text()
        console.warn(
          '[JIRA createIssue] full-payload attempt failed, retrying with minimal payload',
          { status: res.status, body: firstBody },
        )
        const minimalPayload = { fields: requiredFields }
        res = await fetch(issueUrl2, {
          method: 'POST',
          headers: postHeaders2,
          body: JSON.stringify(minimalPayload),
        })
      }

      if (!res.ok) {
        const body = await res.text()
        console.error('[JIRA createIssue] non-OK response', { status: res.status, url: issueUrl2, body })
        throw new Error(parseJiraError(body, res.status))
      }

      const data = /** @type {{ key?: string }} */ (await res.json())
      const issueKey = data.key ?? ''
      const issueUrl = `${trimUrl(cfg.jiraBaseUrl)}/browse/${issueKey}`

      // Update bug doc in Firestore
      await updateDoc(bugRef, {
        jiraIssueKey: issueKey,
        jiraIssueUrl: issueUrl,
        jiraSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return { jiraIssueKey: issueKey, jiraIssueUrl: issueUrl }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // syncStatus — GET /rest/api/3/issue/{key} + update Firestore bug doc
  // -------------------------------------------------------------------------
  const syncStatus = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId
     * @returns {Promise<{ jiraStatus: string, testForgeStatus: string }>}
     */
    async (projectId, bugDocId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore not available.')

      // Load JIRA config
      const cfgSnap = await getDoc(doc(db, `projects/${projectId}/integrations/jira`))
      if (!cfgSnap.exists()) throw new Error('JIRA is not configured.')
      const cfg = /** @type {JiraConfig} */ (cfgSnap.data())

      // Load bug document
      const bugRef = doc(db, `projects/${projectId}/bugs/${bugDocId}`)
      const bugSnap = await getDoc(bugRef)
      if (!bugSnap.exists()) throw new Error(`Bug '${bugDocId}' not found.`)
      const bug = /** @type {{ jiraIssueKey?: string }} */ (bugSnap.data())

      if (!bug.jiraIssueKey) throw new Error('This bug is not linked to a JIRA issue.')

      const { url: syncUrl, extraHeaders: syncHeaders } =
        buildJiraRequest(`/rest/api/3/issue/${bug.jiraIssueKey}`, cfg)

      const res = await fetch(syncUrl, {
        method: 'GET',
        headers: {
          Authorization: buildBasicAuth(cfg.jiraEmail, cfg.jiraApiToken),
          Accept: 'application/json',
          ...syncHeaders,
        },
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`JIRA API error (${res.status}): ${body.slice(0, 200)}`)
      }

      const data = /** @type {{ fields?: { status?: { name?: string } } }} */ (await res.json())
      const jiraStatus = data.fields?.status?.name ?? 'Unknown'
      const testForgeStatus = jiraStatusToTestForge(jiraStatus)

      await updateDoc(bugRef, {
        status: testForgeStatus,
        jiraSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return { jiraStatus, testForgeStatus }
    },
    [],
  )

  return {
    config,
    loading,
    error,
    fetchConfig,
    saveConfig,
    testConnection,
    createIssue,
    syncStatus,
  }
}
