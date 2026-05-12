/**
 * App — Root: Firebase Auth gate + main TestForge shell (Firestore-backed).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { RoleProvider } from './contexts/RoleContext'
import { useRole } from './hooks/useRole'
import { AIGeneratorProvider } from './context/AIGeneratorContext.jsx'
import EditModal from './components/EditModal.jsx'
import ImportModal from './components/ImportModal.jsx'
import Login from './components/Login.jsx'
import ActivityLog from './components/ActivityLog.jsx'
import Dashboard from './components/Dashboard.jsx'
import TabNav from './components/TabNav.jsx'
import TeamManager from './components/TeamManager.jsx'
import TemplateLibrary from './components/TemplateLibrary.jsx'
import TestCaseForm from './components/TestCaseForm.jsx'
import TestCaseTable from './components/TestCaseTable.jsx'
import TestRuns from './components/TestRuns/index.jsx'
import BugTracker from './components/BugTracker.jsx'
import BugDetail from './components/BugDetail.jsx'
import ProjectSettings from './components/ProjectSettings.jsx'
import { ToastProvider } from './components/Toast.jsx'
import Toolbar from './components/Toolbar.jsx'
import MobileSidebar from './components/MobileSidebar.jsx'
import { extractTokenFromUrl, initiateGoogleSignIn } from './utils/googleSheets.js'
import { buildActivityActor } from './utils/memberDisplay.js'
import { logActivity } from './firebase/firestore.js'
import { useTestCases } from './hooks/useTestCases.js'
import { useTemplates } from './hooks/useTemplates.js'
import Unauthorized from './pages/Unauthorized'

const VIEWER_BANNER_DISMISSED_KEY = 'testforge_viewer_banner_dismissed'

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
  setActiveTab,
  count,
  isAdmin,
  isQALead,
}) {
  const { hasPermission } = useRole()
  return (
    <TabNav
      activeTab={activeTab}
      onTabChange={setActiveTab}
      testCaseCount={count}
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
function AppAuthenticated() {
  const {
    user,
    signOutUser,
    userProfile,
    isAdmin,
    isQALead,
    canManageRoles,
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

  const [activeTab, setActiveTab] = useState(
    /** @type {'dashboard' | 'runs' | 'new' | 'templates' | 'all' | 'team' | 'activity' | 'bugs' | 'settings'} */ (
      'dashboard'
    ),
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

  const [templateApplyVersion, setTemplateApplyVersion] = useState(0)
  const [templateDefaultsState, setTemplateDefaultsState] = useState(
    /** @type {Record<string, string>} */ ({}),
  )

  useEffect(() => {
    if (activeTab === 'activity' && !isAdmin && !isQALead) {
      setActiveTab('dashboard')
    }
  }, [activeTab, isAdmin, isQALead])

  useEffect(() => {
    if (activeTab === 'settings' && !isAdmin) {
      setActiveTab('dashboard')
    }
  }, [activeTab, isAdmin])

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
      if (typeof tab === 'string') setActiveTab(/** @type {any} */ (tab))
    }
    window.addEventListener('testforge:navigate', handler)
    return () => window.removeEventListener('testforge:navigate', handler)
  }, [])


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

  const handleFormSubmit = useCallback(
    async (formData) => {
      const result = await addTestCase(formData)
      if (result && result.success) setActiveTab('all')
      return result
    },
    [addTestCase],
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

  const handleUseTemplate = useCallback((defaults) => {
    setTemplateDefaultsState(defaults && typeof defaults === 'object' ? defaults : {})
    setTemplateApplyVersion((v) => v + 1)
    setActiveTab('new')
  }, [])

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

  const handleMobileTabChange = useCallback((tab) => {
    setActiveTab(tab)
    setSidebarOpen(false)
  }, [])

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
  const isUnauthorizedPage =
    typeof window !== 'undefined' && window.location.pathname === '/unauthorized'

  return (
    <RoleProvider projectId={user?.uid ?? null}>
      {isUnauthorizedPage ? (
        <Unauthorized />
      ) : (
        <AIGeneratorProvider>
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
            setActiveTab={setActiveTab}
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
              onNavigate={setActiveTab}
              canCreate={canCreate}
            />
          )}
          {activeTab === 'runs' && (
            <TestRuns
              testCases={testCases}
              testCasesLoading={testCasesLoading}
              onOpenBug={(bugDocId) => {
                setOpenBugDocId(bugDocId)
                setActiveTab('bugs')
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
          {activeTab === 'team' && (
            <TeamManager projectId={user?.uid ?? 'workspace-default'} />
          )}
          {activeTab === 'activity' && (isAdmin || isQALead) && <ActivityLog />}
          {activeTab === 'bugs' && (
            openBugDocId ? (
              <BugDetail
                projectId={user?.uid ?? 'workspace-default'}
                bugDocId={openBugDocId}
                onBack={() => setOpenBugDocId(null)}
                onDeleted={() => setOpenBugDocId(null)}
              />
            ) : (
              <BugTracker
                projectId={user?.uid ?? 'workspace-default'}
                onOpenDetail={(docId) => setOpenBugDocId(docId)}
              />
            )
          )}
          {activeTab === 'settings' && (
            <ProjectSettings projectId={user?.uid ?? 'workspace-default'} />
          )}
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
          </div>
        </AIGeneratorProvider>
      )}
    </RoleProvider>
  )
}

/**
 * Shows a loading state until Firebase reports the initial auth session and workspace profile.
 * @returns {import('react').JSX.Element}
 */
function AuthGate() {
  const {
    user,
    loading,
    roleLoading,
    workspaceError,
    retryWorkspaceProfile,
  } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#EEF2FB] text-[#5A6E9A] gap-4">
        <span
          className="inline-block w-10 h-10 border-2 border-[#1A3263] border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        <p className="text-sm font-mono">Checking authentication…</p>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (roleLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-[#5A6E9A] gap-4">
        <span
          className="inline-block w-10 h-10 border-2 border-[#1A3263] border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-[#1A3263]">Loading your workspace...</p>
      </div>
    )
  }

  if (workspaceError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center gap-4">
        <p className="max-w-md text-sm text-red-700">{workspaceError}</p>
        <button
          type="button"
          onClick={() => {
            void retryWorkspaceProfile()
          }}
          className="rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247]"
        >
          Retry
        </button>
      </div>
    )
  }

  return <AppAuthenticated />
}

/**
 * Root export: wraps the tree with Firebase AuthProvider.
 * @returns {import('react').JSX.Element}
 */
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </AuthProvider>
  )
}
