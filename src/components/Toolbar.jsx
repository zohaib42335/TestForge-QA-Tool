/**
 * Toolbar — Top bar: TestForge logo, grouped nav actions (Sync & Export, Data), and auth profile.
 * On viewports below md, shows a compact three-zone bar with hamburger + centered mark; desktop layout unchanged.
 *
 * @param {Object} props
 * @param {Function} props.onSync - Triggers Google Sheets sync (when connected)
 * @param {Function} props.onExport - Triggers Excel export
 * @param {Object} props.syncStatus - { loading, success, error, message }
 * @param {string|null} props.accessToken - Current OAuth token
 * @param {Function} props.onSignIn - Triggers Google Sign In (connect Sheets)
 * @param {Function} props.onDisconnectSheets - Clears OAuth token / unlink (after connect)
 * @param {Function} props.onClearAll - Clears all test cases
 * @param {Function} props.onImport - Opens bulk import flow
 * @param {Function} [props.onSignOut] - Firebase sign-out
 * @param {{ email: string|null, photoURL: string|null, displayName: string|null, isGoogle: boolean, role: string|null }|null} [props.authProfile]
 * @param {boolean} [props.showSyncMenu]
 * @param {boolean} [props.showDataMenu]
 * @param {boolean} [props.canImport]
 * @param {boolean} [props.canExport]
 * @param {boolean} [props.canDelete]
 * @param {boolean} [props.sidebarOpen] - Mobile drawer open state
 * @param {() => void} [props.onToggleSidebar] - Toggles mobile drawer
 */

import { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoFull, LogoLockup } from './Logo.jsx'
import NavActions from './NavActions.jsx'
import { AIGeneratorContext } from '../context/AIGeneratorContext.jsx'
import { useRole } from '../hooks/useRole'
import RoleBadge from './common/RoleBadge'
import { PermissionGate } from './common/PermissionGate'

/**
 * Derives a single-letter initials from an email local part (e.g. john.doe@x → J).
 * @param {string|null|undefined} email
 * @returns {string}
 */
function firstNameFromEmail(email) {
  if (!email || typeof email !== 'string') return 'User'
  const local = email.split('@')[0]?.trim() || ''
  if (!local) return 'User'
  const segment = local.split(/[._+\-]/)[0] || local
  if (!segment) return 'User'
  return segment.charAt(0).toUpperCase()
}

/**
 * @param {Object} props
 * @param {{ email: string|null, photoURL: string|null, displayName: string|null, isGoogle: boolean, role?: string|null }} props.profile
 * @param {() => void | Promise<void>} props.onSignOut
 * @param {string} [props.projectName]
 */
function ProfileMenu({ profile, onSignOut, projectName }) {
  const { email, photoURL, displayName, isGoogle } = profile
  const { userRole } = useRole()
  const showPhoto = Boolean(isGoogle && photoURL)
  const firstName = firstNameFromEmail(email)
  const pname = projectName != null && String(projectName).trim() !== '' ? String(projectName).trim() : ''

  return (
    <div className="relative flex flex-col items-end gap-0.5">
      {pname ? (
        <div
          className="max-w-[48px] truncate text-center text-[10px] text-gray-400"
          title={pname}
        >
          {pname}
        </div>
      ) : null}
      <div className="relative group flex items-center gap-2">
      {userRole ? <RoleBadge role={userRole} /> : null}
      <button
        type="button"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#B0C0E0] bg-[#D6E0F5] text-[#1A3263] font-medium shadow-sm outline-none ring-offset-2 transition hover:border-[#1A3263] focus-visible:ring-2 focus-visible:ring-[rgba(26,50,99,0.15)] focus-visible:border-[#1A3263]"
        aria-haspopup="true"
        aria-label="Account menu"
      >
        {showPhoto ? (
          <img
            src={photoURL}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="max-w-[2.35rem] truncate px-0.5 text-center text-[10px] font-semibold leading-tight">
            {String(firstName).toUpperCase()}
          </span>
        )}
      </button>

      <div
        className="absolute right-0 top-full z-50 -mt-0.5 pt-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
        role="region"
        aria-label="Account details"
      >
        <div className="w-64 rounded-xl border border-[#B0C0E0] bg-white p-3 shadow-lg">
          {pname ? (
            <p className="truncate text-center text-xs font-semibold text-[#1A3263]" title={pname}>
              {pname}
            </p>
          ) : null}
          {displayName && (
            <p className={`truncate text-sm font-semibold text-[#1A3263] ${pname ? 'mt-2' : ''}`}>{displayName}</p>
          )}
          {email && (
            <p
              className={`break-all text-xs text-[#5A6E9A] ${displayName ? 'mt-1' : pname ? 'mt-2' : ''}`}
              title={email}
            >
              {email}
            </p>
          )}
          <Link
            to="/settings"
            className="mt-3 block w-full rounded-lg border border-[#B0C0E0] py-2 text-center text-sm font-medium text-[#1A3263] transition hover:bg-[#EEF2FB]"
          >
            Project Settings
          </Link>
          <div className="my-2 h-px bg-[#EEF2FB]" aria-hidden />
          <button
            type="button"
            onClick={() => {
              void onSignOut()
            }}
            className="w-full rounded-lg border border-red-200 bg-white py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Sign Out
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {Function} props.onSync
 * @param {Function} props.onExport
 * @param {{ loading: boolean, success: boolean, error: boolean, message: string }} props.syncStatus
 * @param {string|null} props.accessToken
 * @param {Function} props.onSignIn
 * @param {Function} props.onDisconnectSheets
 * @param {Function} props.onClearAll
 * @param {Function} props.onImport
 * @param {Function} [props.onSignOut]
 * @param {{ email: string|null, photoURL: string|null, displayName: string|null, isGoogle: boolean, role?: string|null }|null} [props.authProfile]
 * @param {string} [props.projectName]
 * @param {boolean} [props.showSyncMenu]
 * @param {boolean} [props.showDataMenu]
 * @param {boolean} [props.canImport]
 * @param {boolean} [props.canExport]
 * @param {boolean} [props.canDelete]
 * @param {boolean} [props.sidebarOpen]
 * @param {() => void} [props.onToggleSidebar]
 */
export default function Toolbar({
  onSync,
  onExport,
  syncStatus,
  accessToken,
  onSignIn,
  onDisconnectSheets,
  onClearAll,
  onImport,
  onSignOut,
  authProfile,
  projectName = '',
  showSyncMenu = true,
  showDataMenu = true,
  canImport = true,
  canExport = true,
  canDelete = true,
  sidebarOpen = false,
  onToggleSidebar,
}) {
  // Optional — degrades gracefully when rendered outside AIGeneratorProvider
  const aiCtx = useContext(AIGeneratorContext)
  const [messageVisible, setMessageVisible] = useState(false)
  const [messageFading, setMessageFading] = useState(false)

  useEffect(() => {
    const msg = syncStatus?.message
    if (!msg || String(msg).trim() === '') {
      setMessageVisible(false)
      setMessageFading(false)
      return
    }

    setMessageVisible(true)
    setMessageFading(false)

    const fadeTimer = setTimeout(() => setMessageFading(true), 3500)
    const hideTimer = setTimeout(() => {
      setMessageVisible(false)
      setMessageFading(false)
    }, 4000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [syncStatus?.message, syncStatus?.success, syncStatus?.error])

  const handleDisconnectSheets = () => {
    if (typeof onDisconnectSheets !== 'function') return
    if (
      typeof window !== 'undefined' &&
      window.confirm(
        'Unlink Google Sheets from this browser? You can connect again anytime.',
      )
    ) {
      onDisconnectSheets()
    }
  }

  const hasToken = accessToken != null && String(accessToken).trim() !== ''
  const showProfile =
    authProfile &&
    (authProfile.email || authProfile.photoURL) &&
    typeof onSignOut === 'function'

  const mobileShell = typeof onToggleSidebar === 'function'

  return (
    <header className="sticky top-0 z-40 overflow-visible bg-white border-b border-[#B0C0E0] px-3 py-2 shadow-sm sm:px-4 md:px-6 md:py-4">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 overflow-visible">
        {mobileShell ? (
          <div className="relative flex h-[46px] items-center justify-between px-3 md:hidden">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              style={{
                width: 36,
                height: 36,
                border: sidebarOpen ? '0.5px solid #1A3263' : '0.5px solid #B0C0E0',
                borderRadius: 7,
                background: sidebarOpen ? '#EEF2FB' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              className="shrink-0 p-0 [-webkit-tap-highlight-color:transparent]"
            >
              <span className="relative inline-block h-[18px] w-[18px]">
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    opacity: sidebarOpen ? 0 : 1,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: sidebarOpen ? 'none' : 'auto',
                  }}
                  aria-hidden={sidebarOpen}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={sidebarOpen ? '#1A3263' : '#5A6E9A'}
                    strokeWidth="2"
                    style={{ width: 18, height: 18 }}
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </span>
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    opacity: sidebarOpen ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: sidebarOpen ? 'auto' : 'none',
                  }}
                  aria-hidden={!sidebarOpen}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={sidebarOpen ? '#1A3263' : '#5A6E9A'}
                    strokeWidth="2"
                    style={{ width: 18, height: 18 }}
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </span>
              </span>
            </button>

            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
              className="pointer-events-none whitespace-nowrap"
              aria-hidden
            >
              <LogoLockup iconSize={16} fontSize={15} tone="onLight" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="shrink-0 justify-end">
              {showProfile ? (
                <div data-tour="profile-menu">
                  <ProfileMenu profile={authProfile} onSignOut={onSignOut} projectName={projectName} />
                </div>
              ) : (
                <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
              )}
            </div>
          </div>
        ) : null}

        <div className="hidden md:flex flex-nowrap items-center justify-between gap-2 overflow-visible md:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible md:gap-3" data-tour="toolbar-logo">
            <h1 className="m-0 min-w-0 shrink-0 p-0">
              <LogoFull size="md" className="align-middle" />
            </h1>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:gap-3">
            {/* AI Generate button — shown when context is available */}
            {aiCtx && (
              <PermissionGate permission="ai_generate">
              <button
                type="button"
                id="toolbar-ai-generate-btn"
                onClick={aiCtx.openModal}
                className="inline-flex h-8 shrink-0 items-center gap-[5px] rounded-md border-[0.5px] border-[#4169C4] bg-[#EEF2FB] px-2.5 py-[5px] text-xs font-medium text-[#1A3263] transition hover:bg-[#D6E0F5] hover:border-[#1A3263]"
                aria-label="Open AI test case generator"
              >
                <span aria-hidden="true">✨</span>
                <span className="hidden md:inline">AI Generate</span>
              </button>
              </PermissionGate>
            )}

            {(showSyncMenu || showDataMenu) && (
              <NavActions
                onGoogleSheetSync={() => {
                  if (hasToken) {
                    onSync()
                  } else {
                    onSignIn()
                  }
                }}
                onExportExcel={onExport}
                onImport={onImport}
                onClearAll={onClearAll}
                googleSheetsConnected={hasToken}
                syncLoading={syncStatus?.loading === true}
                onDisconnectGoogleSheets={handleDisconnectSheets}
                showSyncMenu={showSyncMenu}
                showDataMenu={showDataMenu}
                canImport={canImport}
                canExport={canExport}
                canDelete={canDelete}
              />
            )}

            {showProfile && (
              <>
                <div
                  className="hidden h-8 w-[0.5px] shrink-0 bg-[#B0C0E0] sm:block"
                  aria-hidden
                />
                <div data-tour="profile-menu">
                  <ProfileMenu
                    profile={authProfile}
                    onSignOut={onSignOut}
                    projectName={projectName}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {messageVisible && syncStatus?.message && (
          <p
            className={`max-w-xl text-sm transition-opacity duration-500 ${
              syncStatus.success ? 'text-green-600' : ''
            } ${syncStatus.error ? 'text-red-600' : ''} ${
              !syncStatus.success && !syncStatus.error ? 'text-[#5A6E9A]' : ''
            } ${messageFading ? 'opacity-0' : 'opacity-100'}`}
            role="status"
          >
            {syncStatus.message}
          </p>
        )}
      </div>
    </header>
  )
}
