/**
 * @fileoverview ProjectSettings — Admin-only settings page with Integrations section.
 * Currently features JIRA integration configuration.
 *
 * @param {Object} props
 * @param {string} props.projectId
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJiraIntegration } from '../hooks/useJiraIntegration.js'
import { useRequirePermission } from '../hooks/useRequirePermission'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../contexts/ProjectContext'
import { callDeleteProject } from '../firebase/projectCallables'
import { useToast } from './Toast.jsx'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectSettings({ projectId }) {
  const { allowed, loading: permissionLoading } = useRequirePermission('project_settings_edit')
  const { userRole } = useRole()
  const { signOutUser } = useAuth()
  const { project: ctxProject } = useProject()
  const navigate = useNavigate()
  const showToast = useToast()
  const {
    config,
    loading: jiraLoading,
    fetchConfig,
    saveConfig,
    testConnection,
  } = useJiraIntegration()

  // Local form state
  const [enabled, setEnabled] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [issueType, setIssueType] = useState('Bug')
  const [autoSync, setAutoSync] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState(
    /** @type {{ success: boolean, accountName?: string, error?: string } | null} */ (null),
  )
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  useEffect(() => {
    if (projectId) void fetchConfig(projectId)
  }, [projectId, fetchConfig])

  // Sync config → local state
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled ?? false)
      setBaseUrl(config.jiraBaseUrl ?? '')
      setProjectKey(config.jiraProjectKey ?? '')
      setEmail(config.jiraEmail ?? '')
      setApiToken(config.jiraApiToken ?? '')
      setIssueType(config.defaultIssueType ?? 'Bug')
      setAutoSync(config.autoSync ?? false)
      setProxyUrl(config.proxyUrl ?? '')
    }
  }, [config])

  const handleSave = useCallback(async () => {
    if (!projectId) return
    setSaving(true)
    try {
      await saveConfig(projectId, {
        enabled,
        jiraBaseUrl: baseUrl.trim(),
        jiraProjectKey: projectKey.trim().toUpperCase(),
        jiraEmail: email.trim(),
        jiraApiToken: apiToken.trim(),
        defaultIssueType: issueType.trim() || 'Bug',
        defaultPriority: 'High',
        autoSync,
        proxyUrl: proxyUrl.trim(),
      })
      showToast('JIRA settings saved', 'success')
    } catch {
      showToast('Failed to save JIRA settings', 'error')
    } finally {
      setSaving(false)
    }
  }, [projectId, enabled, baseUrl, projectKey, email, apiToken, issueType, autoSync, proxyUrl, saveConfig, showToast])

  const workspaceName =
    ctxProject && typeof ctxProject.name === 'string' && ctxProject.name.trim() !== ''
      ? ctxProject.name.trim()
      : ''

  const handleConfirmDeleteWorkspace = useCallback(async () => {
    if (!projectId || workspaceName === '') return
    if (deleteConfirmName.trim() !== workspaceName) {
      showToast('Project name does not match.', 'error')
      return
    }
    setDeleteBusy(true)
    try {
      await callDeleteProject(projectId)
      showToast('Workspace deleted.', 'success')
      setDeleteModalOpen(false)
      setDeleteConfirmName('')
      await signOutUser()
      navigate('/onboarding', { replace: true })
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not delete workspace.',
        'error',
      )
    } finally {
      setDeleteBusy(false)
    }
  }, [projectId, workspaceName, deleteConfirmName, showToast, signOutUser, navigate])

  const handleTestConnection = useCallback(async () => {
    if (!projectId) return
    setTesting(true)
    setConnectionResult(null)
    try {
      const result = await testConnection(projectId)
      setConnectionResult(result)
      if (result.success) {
        showToast(`Connected as ${result.accountName}`, 'success')
      } else {
        showToast(result.error ?? 'Connection failed', 'error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection test failed'
      setConnectionResult({ success: false, error: msg })
      showToast(msg, 'error')
    } finally {
      setTesting(false)
    }
  }, [projectId, testConnection, showToast])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputClass =
    'w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20'
  const labelClass = 'block text-[12px] font-medium text-[#1A3263] mb-1.5'

  if (permissionLoading || !allowed) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 py-6">
      {/* Page Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#1A3263]">Project Settings</h1>
        <p className="mt-1 text-[13px] text-[#5A6E9A]">
          Configure integrations and project-level settings.
        </p>
      </div>

      {/* Integrations Section */}
      <div className="rounded-[12px] border border-[#B0C0E0] bg-white shadow-sm">
        {/* Section Header */}
        <div className="border-b border-[#D6E0F5] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#1A3263]">Integrations</h2>
          <p className="mt-0.5 text-[12px] text-[#5A6E9A]">Connect external tools to your workflow.</p>
        </div>

        {/* JIRA Card */}
        <div className="px-5 py-5">
          <div className="rounded-[10px] border border-[#D6E0F5] bg-[#FAFBFE] p-5">
            {/* JIRA Header Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* JIRA Logo */}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0052CC]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden>
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.37h1.8v1.72a4.362 4.362 0 004.34 4.35V7.65a.85.85 0 00-.85-.85H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72a4.35 4.35 0 004.34 4.34v-9.57a.84.84 0 00-.84-.84H2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1A3263]">JIRA</h3>
                  <p className="text-[11px] text-[#5A6E9A]">Sync bugs with your JIRA workspace</p>
                </div>
                {/* Status badge */}
                {enabled && config?.jiraBaseUrl && connectionResult?.success && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Connected
                  </span>
                )}
              </div>

              {/* Enable Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  enabled ? 'bg-[#1A3263]' : 'bg-[#D6E0F5]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Config Form — shown when enabled */}
            {enabled && (
              <div className="mt-5 space-y-4 border-t border-[#D6E0F5] pt-5">
                {/* Row 1: Base URL */}
                <div>
                  <label className={labelClass}>
                    JIRA Base URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://yourcompany.atlassian.net"
                    className={inputClass}
                  />
                </div>

                {/* Row 2: Project Key + Issue Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>
                      Project Key <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value)}
                      placeholder="QA"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Default Issue Type</label>
                    <input
                      type="text"
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value)}
                      placeholder="Bug"
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Row 3: Email */}
                <div>
                  <label className={labelClass}>
                    Atlassian Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={inputClass}
                  />
                </div>

                {/* Row 4: API Token */}
                <div>
                  <label className={labelClass}>
                    API Token <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    className={inputClass}
                  />
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#4169C4] hover:underline"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14L21 3" />
                    </svg>
                    How to get an API token
                  </a>
                </div>

                {/* Auto-sync toggle */}
                <div className="flex items-center justify-between rounded-lg border border-[#D6E0F5] bg-white px-4 py-3">
                  <div>
                    <p className="text-[12px] font-medium text-[#1A3263]">
                      Auto-sync on bug creation
                    </p>
                    <p className="text-[11px] text-[#5A6E9A]">
                      Automatically create a JIRA issue when a bug is reported
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSync}
                    onClick={() => setAutoSync(!autoSync)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      autoSync ? 'bg-[#1A3263]' : 'bg-[#D6E0F5]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                        autoSync ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* CORS Proxy URL */}
                <div className="rounded-lg border border-[#D6E0F5] bg-white px-4 py-3 space-y-2">
                  <div>
                    <p className="text-[12px] font-medium text-[#1A3263]">CORS Proxy URL
                      <span className="ml-1.5 rounded-full bg-[#EEF2FB] px-1.5 py-0.5 text-[10px] text-[#5A6E9A]">Optional</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5A6E9A]">
                      Required in production if JIRA blocks browser requests (CORS).
                      Deploy the free{' '}
                      <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4169C4] hover:underline"
                        title="See cloudflare-worker/README.md in your project"
                      >
                        Cloudflare Worker proxy
                      </a>
                      {' '}included in this project.
                    </p>
                  </div>
                  <input
                    type="url"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="https://testforge-jira-proxy.your-account.workers.dev"
                    className={inputClass}
                  />
                  {!proxyUrl && (
                    <p className="text-[10px] text-[#5A6E9A]">
                      Leave empty to call JIRA directly (works on localhost).
                    </p>
                  )}
                  {proxyUrl && (
                    <p className="inline-flex items-center gap-1 text-[10px] text-green-600">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Proxy enabled — JIRA calls will route through your Worker.
                    </p>
                  )}
                </div>

                {/* Connection test result */}
                {connectionResult && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-[12px] ${
                      connectionResult.success
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {connectionResult.success
                      ? `✓ Connected as ${connectionResult.accountName}`
                      : `✗ ${connectionResult.error}`}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || !baseUrl.trim() || !email.trim() || !apiToken.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#B0C0E0] bg-white px-3.5 py-2 text-[12px] font-medium text-[#1A3263] transition hover:bg-[#EEF2FB] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" aria-hidden />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <path d="M22 4L12 14.01l-3-3" />
                      </svg>
                    )}
                    {testing ? 'Testing…' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || jiraLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A3263] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#122247] disabled:opacity-60"
                  >
                    {saving ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                        <path d="M17 21v-8H7v8M7 3v5h8" />
                      </svg>
                    )}
                    {saving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {userRole === 'Owner' ? (
        <section
          className="rounded-[12px] border-2 border-red-400 bg-white px-5 py-5 shadow-sm"
          aria-labelledby="danger-zone-title"
        >
          <h2 id="danger-zone-title" className="text-[15px] font-semibold text-red-700">
            Danger Zone
          </h2>
          <p className="mt-2 max-w-xl text-[12px] text-[#5A6E9A]">
            Permanently delete this workspace and all associated data. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmName('')
              setDeleteModalOpen(true)
            }}
            className="mt-4 inline-flex rounded-lg border-2 border-red-600 bg-white px-4 py-2 text-[12px] font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete Workspace
          </button>
        </section>
      ) : null}

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl"
          >
            <h3 id="delete-workspace-title" className="text-lg font-semibold text-[#1A3263]">
              Delete workspace permanently?
            </h3>
            <p className="mt-3 text-sm text-[#5A6E9A]">
              This will permanently delete all test cases, runs, bugs, and team data. This cannot be
              undone.
            </p>
            <p className="mt-4 text-[12px] font-medium text-[#1A3263]">
              Type <span className="font-mono font-bold">{workspaceName || '—'}</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              autoComplete="off"
              className={inputClass}
              placeholder={workspaceName || 'Project name'}
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirmName('')
                }}
                className="rounded-lg border border-[#B0C0E0] bg-white px-4 py-2 text-sm font-medium text-[#1A3263] hover:bg-[#EEF2FB]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  deleteBusy ||
                  !workspaceName ||
                  deleteConfirmName.trim() !== workspaceName
                }
                onClick={() => {
                  void handleConfirmDeleteWorkspace()
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
