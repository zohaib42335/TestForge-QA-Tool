/**
 * AppShell — main TestForge layout (requires auth + project route guards).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { RoleProvider } from '../contexts/RoleContext'
import { useProject } from '../contexts/ProjectContext'
import { pathToTab, TAB_TO_PATH } from '../routes/tabPaths.js'
import { useRole } from '../hooks/useRole'
import { AIGeneratorProvider } from '../context/AIGeneratorContext.jsx'
import EditModal from '../components/EditModal.jsx'
import ImportModal from '../components/ImportModal.jsx'
import ActivityLog from '../components/ActivityLog.jsx'
import Dashboard from '../components/Dashboard.jsx'
import TabNav from '../components/TabNav.jsx'
import TeamManager from '../components/TeamManager.jsx'
import TemplateLibrary from '../components/TemplateLibrary.jsx'
import TestCaseForm from '../components/TestCaseForm.jsx'
import TestCaseTable from '../components/TestCaseTable.jsx'
import TestRuns from '../components/TestRuns/index.jsx'
import BugTracker from '../components/BugTracker.jsx'
import BugDetail from '../components/BugDetail.jsx'
import ProjectSettings from '../components/ProjectSettings.jsx'
import PageSkeleton from '../components/PageSkeleton.jsx'
import ProjectSwitcher from '../components/ProjectSwitcher.jsx'
import Toolbar from '../components/Toolbar.jsx'
import MobileSidebar from '../components/MobileSidebar.jsx'
import { extractTokenFromUrl, initiateGoogleSignIn } from '../utils/googleSheets.js'
import { buildActivityActor } from '../utils/memberDisplay.js'
import { logActivity } from '../firebase/firestore.js'
import { useTestCases } from '../hooks/useTestCases.js'
import { useTemplates } from '../hooks/useTemplates.js'
import Unauthorized from '../pages/Unauthorized'

const VALID_APP_PATHS = new Set(Object.values(TAB_TO_PATH))

const VIEWER_BANNER_DISMISSED_KEY = 'testforge_viewer_banner_dismissed'
const INVITE_JOIN_NOTICE_KEY = 'testforge_invite_join_notice'

function RoleReadOnlyBanner() {
  const { userRole } = useRole()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(VIEWER_BANNER_DISMISSED_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  if (userRole !== 'Viewer' || dismissed) return null
  return (
    <div className="border-b border-[#CBD5E1] bg-[#EEF2FB] px-4 py-1.5 text-center text-xs text-[#334155]">
      <span>👁 You have view-only access to this project</span>
      <button
        type="button"
        className="ml-3 text-[#5A6E9A] hover:text-[#1A3263]"
        onClick={() => {
          try {
            localStorage.setItem(VIEWER_BANNER_DISMISSED_KEY, '1')
          } catch {
            // no-op
          }
          setDismissed(true)
        }}
        aria-label="Dismiss banner"
      >
        ×
      </button>
    </div>
  )
}

function RoleAwareTabs({
  activeTab,
  onTabChange,
  count,
  isAdmin,
  isQALead,
}) {
  const { hasPermission } = useRole()
  return (
    <TabNav
      activeTab={activeTab}
      onTabChange={onTabChange}
      testCaseCount={count}
      useRouter
      showNewTab={hasPermission('testcase_create')}
      showTeamTab
      showActivityTab={isAdmin || isQALead}
      showSettingsTab={hasPermission('project_settings_edit')}
    />
  )
}

/**
 * Full application shell (requires authenticated Firebase user).
 * @returns {import('react').JSX.Element}
 */
export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId: ctxProjectId, project, loading: projectCtxLoading } = useProject()

  const {
    user,
    signOutUser,
    userProfile,
    isAdmin,
    isQALead,
    canCreate,
    canImport,
    canExport,
    canDelete,
    canManageTemplates,
  } = useAuth()

  const {
    testCases,
    addTestCase,
    updateTestCase,
    deleteTestCase,
    loading: testCasesLoading,
    error: testCasesError,
    isSubmitting: isSavingTestCase,
    isUpdating: isUpdatingTestCase,
    updatingDocId,
    deletingDocIds,
    syncStatus,
    resetSyncStatus,
    syncToSheets,
    exportExcel,
    clearAll,
  } = useTestCases()
  const { isSavingTemplate, addTemplate } = useTemplates()

  const activeTab = pathToTab(location.pathname)

  const goTab = useCallback(
    (/** @type {keyof typeof TAB_TO_PATH} */ tab) => {
      const path = TAB_TO_PATH[tab]
      if (path) navigate(path)
    },
    [navigate],
  )

  /** @type {[string|null, import('react').Dispatch<any>]} */
  const [openBugDocId, setOpenBugDocId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accessToken, setAccessToken] = useState(/** @type {string|null} */ (null))
  const [editingTestCase, setEditingTestCase] = useState(/** @type {object|null} */ (null))

  const [importOpen, setImportOpen] = useState(false)
  /** @type {[null | { text: string }, import('react').Dispatch<import('react').SetStateAction<null | { text: string }>>]} */
  const [importToast, setImportToast] = useState(null)
  /** @type {[null | { text: string, kind: 'success' | 'error' }, import('react').Dispatch<import('react').SetStateAction<null | { text: string, kind: 'success' | 'error' }>>]} */
  const [templateToast, setTemplateToast] = useState(null)
  const [inviteJoinToast, setInviteJoinToast] = useState('')

  const [templateApplyVersion, setTemplateApplyVersion] = useState(0)
  const [templateDefaultsState, setTemplateDefaultsState] = useState(
    /** @type {Record<string, string>} */ ({}),
  )

  useEffect(() => {
    const p = location.pathname.replace(/\/+$/, '') || '/'
    if (!VALID_APP_PATHS.has(p)) {
      navigate('/dashboard', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    if (activeTab !== 'bugs') {
      setOpenBugDocId(null)
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'activity' && !isAdmin && !isQALead) {
      navigate('/dashboard', { replace: true })
    }
  }, [activeTab, isAdmin, isQALead, navigate])

  useEffect(() => {
    if (activeTab === 'settings' && !isAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [activeTab, isAdmin, navigate])

  useEffect(() => {
    const token = extractTokenFromUrl()
    if (token) {
      setAccessToken(token)
      const path = window.location.pathname + window.location.search
      window.history.replaceState(null, '', path)
    }
  }, [])

  // Allows deeply-nested components (e.g. empty state buttons) to trigger tab changes
  // without requiring prop drilling through the entire tree.
  useEffect(() => {
    const handler = (/** @type {CustomEvent} */ e) => {
      const tab = e?.detail
      if (typeof tab === 'string' && tab in TAB_TO_PATH) {
        navigate(TAB_TO_PATH[/** @type {keyof typeof TAB_TO_PATH} */ (tab)])
      }
    }
    window.addEventListener('testforge:navigate', handler)
    return () => window.removeEventListener('testforge:navigate', handler)
  }, [navigate])


  useEffect(() => {
    if (!importToast) return
    const t = setTimeout(() => setImportToast(null), 6000)
    return () => clearTimeout(t)
  }, [importToast])

  useEffect(() => {
    if (!templateToast) return
    const t = setTimeout(() => setTemplateToast(null), 3500)
    return () => clearTimeout(t)
  }, [templateToast])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INVITE_JOIN_NOTICE_KEY)
      if (!raw) return
      sessionStorage.removeItem(INVITE_JOIN_NOTICE_KEY)
      const parsed = JSON.parse(raw)
      const role = parsed && typeof parsed.role === 'string' ? parsed.role : ''
      if (role) {
        setInviteJoinToast(`You joined the project as ${role}.`)
      }
    } catch {
      // ignore malformed storage payload
    }
  }, [])

  useEffect(() => {
    if (!inviteJoinToast) return
    const t = setTimeout(() => setInviteJoinToast(''), 5000)
    return () => clearTimeout(t)
  }, [inviteJoinToast])

  const handleFormSubmit = useCallback(
    async (formData) => {
      const result = await addTestCase(formData)
      if (result && result.success) navigate('/test-cases')
      return result
    },
    [addTestCase, navigate],
  )

  const handleEdit = useCallback((tc) => {
    setEditingTestCase(tc)
  }, [])

  const handleModalSave = useCallback(
    async (payload) => {
      const docId = editingTestCase?.id ?? null
      if (!docId) {
        return {
          success: false,
          errors: { testCaseId: 'Missing Firestore document id for this test case.' },
          error: 'Cannot update: missing Firestore document id.',
        }
      }
      return await updateTestCase(String(docId), payload)
    },
    [updateTestCase, editingTestCase?.id],
  )

  const handleModalClose = useCallback(() => {
    setEditingTestCase(null)
  }, [])

  const handleSync = useCallback(() => {
    return syncToSheets(accessToken)
  }, [syncToSheets, accessToken])

  const handleDisconnectSheets = useCallback(() => {
    setAccessToken(null)
    resetSyncStatus()
  }, [resetSyncStatus])

  const handleUseTemplate = useCallback(
    (defaults) => {
      setTemplateDefaultsState(defaults && typeof defaults === 'object' ? defaults : {})
      setTemplateApplyVersion((v) => v + 1)
      navigate('/test-cases/new')
    },
    [navigate],
  )

  const handleSaveAsTemplate = useCallback(
    async ({ name, description, defaults }) => {
      const result = await addTemplate({ name, description, defaults })
      if (!result.success) {
        setTemplateToast({
          kind: 'error',
          text: result.error || 'Could not save template.',
        })
        return
      }
      const actor = buildActivityActor(userProfile, user)
      if (actor) {
        void logActivity({
          action: 'template.created',
          entityType: 'template',
          entityId: typeof result.id === 'string' ? result.id : '',
          entityRef: name,
          actor,
        })
      }
      setTemplateToast({
        kind: 'success',
        text: 'Template saved successfully.',
      })
    },
    [addTemplate, user, userProfile],
  )

  const handleImportBundle = useCallback(
    ({ imported, skipped, error }) => {
      const n = typeof imported === 'number' ? imported : 0
      const s = typeof skipped === 'number' ? skipped : 0
      setImportToast({
        text: error
          ? `Import failed: ${error}`
          : `${n} test case${n === 1 ? '' : 's'} imported successfully, ${s} skipped due to errors.`,
      })
    },
    [],
  )

  const handleFirebaseSignOut = useCallback(async () => {
    await signOutUser()
  }, [signOutUser])

  const handleMobileTabChange = useCallback(
    (tab) => {
      if (tab in TAB_TO_PATH) {
        navigate(TAB_TO_PATH[/** @type {keyof typeof TAB_TO_PATH} */ (tab)])
      }
      setSidebarOpen(false)
    },
    [navigate],
  )

  const count = Array.isArray(testCases) ? testCases.length : 0
  const sheetsConnected = accessToken != null && String(accessToken).trim() !== ''

  const authProfile = useMemo(() => {
    if (!user) return null
    const isGoogle =
      Array.isArray(user.providerData) &&
      user.providerData.some((p) => p?.providerId === 'google.com')
    const role =
      userProfile && typeof userProfile.role === 'string' ? userProfile.role : null
    return {
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      displayName: user.displayName ?? null,
      isGoogle,
      role,
    }
  }, [user, userProfile])

  const showSyncMenu = canExport
  const showDataMenu = canImport || canDelete
  const activeProjectId =
    ctxProjectId && String(ctxProjectId).trim() !== ''
      ? String(ctxProjectId).trim()
      : userProfile && typeof userProfile.projectId === 'string' && userProfile.projectId.trim() !== ''
        ? userProfile.projectId.trim()
        : null
  const projectDisplayName =
    project && typeof project.name === 'string' && project.name.trim() !== ''
      ? project.name.trim()
      : ''
  const isUnauthorizedPage = location.pathname.replace(/\/+$/, '') === '/unauthorized'

  if (projectCtxLoading) {
    return <PageSkeleton />
  }

  if (!ctxProjectId) {
    return null
  }

  return (
    <RoleProvider projectId={activeProjectId ?? undefined}>
      {isUnauthorizedPage ? (
        <Unauthorized />
      ) : (
        <AIGeneratorProvider projectId={activeProjectId ?? ''}>
          <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#EEF2FB] text-[#1A3263]">
        <Toolbar
          onSync={handleSync}
          onExport={exportExcel}
          syncStatus={syncStatus}
          accessToken={accessToken}
          onSignIn={initiateGoogleSignIn}
          onDisconnectSheets={handleDisconnectSheets}
          onClearAll={clearAll}
          onImport={() => setImportOpen(true)}
          onSignOut={handleFirebaseSignOut}
          authProfile={authProfile}
          projectName={projectDisplayName}
          showSyncMenu={showSyncMenu}
          showDataMenu={showDataMenu}
          canImport={canImport}
          canExport={canExport}
          canDelete={canDelete}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        <RoleReadOnlyBanner />

        <MobileSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={handleMobileTabChange}
          testCaseCount={count}
          userProfile={userProfile}
          currentUser={user}
          projectName={projectDisplayName}
          onOpenSettings={() => {
            navigate('/settings')
            setSidebarOpen(false)
          }}
          onSignOut={() => {
            void handleFirebaseSignOut()
            setSidebarOpen(false)
          }}
          showTeamSection
          showSyncFooter={showSyncMenu && canExport}
          showImportFooter={canImport}
          showExportFooter={canExport}
          syncLoading={syncStatus?.loading === true}
          onSyncPrimary={() => {
            if (sheetsConnected) {
              void handleSync()
            } else {
              initiateGoogleSignIn()
            }
          }}
          onImport={() => setImportOpen(true)}
          onExport={() => {
            exportExcel()
          }}
        />

        <div className="relative bg-white">
          <RoleAwareTabs
            activeTab={activeTab}
            onTabChange={goTab}
            count={count}
            isAdmin={isAdmin}
            isQALead={isQALead}
          />
        </div>

        <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-4 lg:px-5 xl:max-w-[1600px]">
          {activeTab === 'dashboard' && (
            <Dashboard
              testCases={testCases}
              loading={testCasesLoading}
              error={testCasesError}
              onNavigate={goTab}
              canCreate={canCreate}
            />
          )}
          {activeTab === 'runs' && (
            <TestRuns
              projectId={activeProjectId}
              testCases={testCases}
              testCasesLoading={testCasesLoading}
              onOpenBug={(bugDocId) => {
                setOpenBugDocId(bugDocId)
                navigate('/bugs')
              }}
            />
          )}
          {activeTab === 'new' &&
            (canCreate ? (
              <TestCaseForm
                onSubmit={handleFormSubmit}
                isSubmitting={isSavingTestCase || isSavingTemplate}
                templateApplyVersion={templateApplyVersion}
                templateDefaults={templateDefaultsState}
                onSaveAsTemplate={canManageTemplates ? handleSaveAsTemplate : undefined}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-[#B0C0E0] bg-white px-6 py-16 text-center">
                <p className="max-w-md text-[14px] leading-relaxed text-[#5A6E9A]">
                  You need QA Lead or Admin access to create test cases. Contact your
                  administrator.
                </p>
              </div>
            ))}
          {activeTab === 'templates' && (
            <TemplateLibrary
              onUseTemplate={handleUseTemplate}
              canManageTemplates={canManageTemplates}
            />
          )}
          {activeTab === 'all' && (
            <TestCaseTable
              testCases={testCases}
              loading={testCasesLoading}
              error={testCasesError}
              onEdit={handleEdit}
              onDelete={deleteTestCase}
              deletingDocIds={deletingDocIds}
            />
          )}
          {activeTab === 'team' &&
            (activeProjectId ? (
              <TeamManager projectId={activeProjectId} />
            ) : (
              <div className="rounded-xl border border-[#B0C0E0] bg-white px-6 py-10 text-center text-sm text-[#5A6E9A]">
                No project is assigned to your account yet.
              </div>
            ))}
          {activeTab === 'activity' && (isAdmin || isQALead) && <ActivityLog />}
          {activeTab === 'bugs' &&
            (activeProjectId ? (
              openBugDocId ? (
                <BugDetail
                  projectId={activeProjectId}
                  bugDocId={openBugDocId}
                  onBack={() => setOpenBugDocId(null)}
                  onDeleted={() => setOpenBugDocId(null)}
                />
              ) : (
                <BugTracker
                  projectId={activeProjectId}
                  onOpenDetail={(docId) => setOpenBugDocId(docId)}
                />
              )
            ) : (
              <div className="rounded-xl border border-[#B0C0E0] bg-white px-6 py-10 text-center text-sm text-[#5A6E9A]">
                No project is assigned to your account yet.
              </div>
            ))}
          {activeTab === 'settings' &&
            (activeProjectId ? (
              <ProjectSettings projectId={activeProjectId} />
            ) : (
              <div className="rounded-xl border border-[#B0C0E0] bg-white px-6 py-10 text-center text-sm text-[#5A6E9A]">
                No project is assigned to your account yet.
              </div>
            ))}
        </div>

        <EditModal
          testCase={editingTestCase}
          onSave={handleModalSave}
          isSubmitting={isUpdatingTestCase}
          savingDocId={updatingDocId}
          onClose={handleModalClose}
        />

        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={handleImportBundle}
          projectId={activeProjectId}
        />

        {importToast && (
          <div
            className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 max-w-lg w-[90vw] rounded-lg border border-green-200 bg-green-50 border-l-4 border-l-green-500 px-5 py-4 text-center text-sm text-green-800 shadow-sm"
            role="status"
          >
            {importToast.text}
          </div>
        )}

        {templateToast && (
          <div
            className={`fixed bottom-6 right-6 z-[75] max-w-sm w-[88vw] sm:w-auto rounded-lg border-l-4 px-4 py-3 text-sm shadow-md ${
              templateToast.kind === 'success'
                ? 'border border-green-200 border-l-green-500 bg-green-50 text-green-800'
                : 'border border-red-200 border-l-red-500 bg-red-50 text-red-800'
            }`}
            role="status"
          >
            {templateToast.text}
          </div>
        )}
        {inviteJoinToast && (
          <div
            className="fixed bottom-20 right-6 z-[76] max-w-sm w-[88vw] sm:w-auto rounded-lg border border-green-200 border-l-4 border-l-green-500 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-md"
            role="status"
          >
            {inviteJoinToast}
          </div>
        )}
          </div>
        </AIGeneratorProvider>
      )}
    </RoleProvider>
  )
}
