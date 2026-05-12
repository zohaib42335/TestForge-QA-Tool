/**
 * @fileoverview Mobile-only slide-in navigation (left drawer) for TestForge.
 * Renders overlay + panel below 768px; desktop uses TabNav instead.
 * Handles Escape close, body scroll lock, and routes primary actions to parent callbacks.
 */

import { useEffect } from 'react'
import { LogoLockup } from './Logo.jsx'

/** @typedef {'dashboard'|'runs'|'new'|'templates'|'all'|'team'|'activity'} TabKey */

/**
 * @param {string|null|undefined} name
 * @param {string|null|undefined} email
 * @returns {string}
 */
function initialsFromUser(name, email) {
  const n = name == null ? '' : String(name).trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
    }
    return n.slice(0, 2).toUpperCase()
  }
  const e = email == null ? '' : String(email).trim()
  if (e) return e.slice(0, 2).toUpperCase()
  return '?'
}

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {TabKey} props.activeTab
 * @param {(tab: TabKey) => void} props.onTabChange
 * @param {number} props.testCaseCount
 * @param {Record<string, unknown>|null} [props.userProfile]
 * @param {{ email?: string|null, displayName?: string|null }|null} [props.currentUser]
 * @param {boolean} props.showTeamSection
 * @param {boolean} props.showSyncFooter
 * @param {boolean} props.showImportFooter
 * @param {boolean} props.showExportFooter
 * @param {boolean} props.syncLoading
 * @param {() => void} props.onSyncPrimary
 * @param {() => void} props.onImport
 * @param {() => void} props.onExport
 */

export default function MobileSidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  testCaseCount,
  userProfile = null,
  currentUser = null,
  showTeamSection,
  showSyncFooter,
  showImportFooter,
  showExportFooter,
  syncLoading,
  onSyncPrimary,
  onImport,
  onExport,
}) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handler)
    }
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const displayName =
    userProfile && typeof userProfile.displayName === 'string'
      ? userProfile.displayName.trim()
      : currentUser?.displayName && String(currentUser.displayName).trim()
        ? String(currentUser.displayName).trim()
        : ''
  const email =
    currentUser?.email != null && String(currentUser.email).trim()
      ? String(currentUser.email).trim()
      : ''
  const nameLine =
    (userProfile && typeof userProfile.displayName === 'string' && userProfile.displayName.trim()) ||
    email ||
    'Signed in'
  const roleRaw =
    userProfile && typeof userProfile.role === 'string' ? userProfile.role.trim() : 'Member'
  const roleLabel = roleRaw === 'Tester' ? 'Member' : roleRaw || 'Member'

  /** @type {Record<string, { bg: string; color: string; border: string }>} */
  const roleStyles = {
    Owner: {
      bg: '#F3E8FF',
      color: '#5B21B6',
      border: '#D8B4FE',
    },
    Admin: {
      bg: '#EEF2FB',
      color: '#1A3263',
      border: '#B0C0E0',
    },
    'QA Lead': {
      bg: '#EAF3DE',
      color: '#3B6D11',
      border: '#97C459',
    },
    Member: {
      bg: '#EEF2FB',
      color: '#2A4A8A',
      border: '#B0C0E0',
    },
    Viewer: {
      bg: '#F1F5F9',
      color: '#334155',
      border: '#CBD5E1',
    },
  }
  const rs = roleStyles[roleLabel] || roleStyles.Member

  const go = (/** @type {TabKey} */ key) => {
    onTabChange(key)
    onClose()
  }

  const navItemClass = (/** @type {TabKey} */ key) => {
    const active = activeTab === key
    const base =
      'flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-lg border-l-[3px] border-transparent py-2.5 pl-3 pr-3 text-left text-[13px] text-[#5A6E9A] transition-colors duration-100 mb-0.5'
    return active
      ? `${base} border-l-[#1A3263] bg-[#EEF2FB] pl-[9px] font-medium text-[#1A3263] [&_svg]:text-[#4169C4]`
      : `${base} hover:bg-[#EEF2FB] hover:text-[#1A3263]`
  }

  const sectionLabelClass =
    'px-2.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.07em] text-[#B0C0E0] first:mt-0 mt-1'

  const iconWrap = 'h-4 w-4 shrink-0 text-current'

  return (
    <div className="md:hidden" aria-hidden={!isOpen}>
      {/* Overlay */}
      <div
        role="presentation"
        tabIndex={-1}
        className="fixed inset-0 z-[40] transition-opacity duration-[250ms] ease-in-out [-webkit-tap-highlight-color:transparent]"
        style={{
          background: 'rgba(0, 0, 0, 0.45)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-[50] flex w-[260px] max-w-[85vw] flex-col overflow-hidden border-r-[0.5px] border-[#B0C0E0] bg-white transition-transform duration-[250ms] ease-in-out [-webkit-overflow-scrolling:touch]"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          WebkitTransform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div
          className="flex h-[52px] shrink-0 items-center justify-between px-3.5"
          style={{ background: '#1A3263' }}
        >
          <div className="flex min-w-0 flex-1 items-center pr-2">
            <LogoLockup iconSize={16} fontSize={15} tone="onBrand" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border-0 p-0 [-webkit-tap-highlight-color:transparent]"
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 6,
            }}
            aria-label="Close sidebar"
          >
            <span
              className="flex h-[30px] w-[30px] items-center justify-center"
              style={{ borderRadius: 6 }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                style={{ width: 15, height: 15 }}
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </span>
          </button>
        </div>

        {/* Profile */}
        <div
          className="flex shrink-0 items-center gap-2.5 border-b-[0.5px] border-[#D6E0F5] bg-white px-3.5 py-3"
          style={{ paddingLeft: 14, paddingRight: 14 }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-[#1A3263]"
            style={{ background: '#D6E0F5' }}
            aria-hidden
          >
            {initialsFromUser(displayName || nameLine, email)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[13px] font-medium text-[#1A3263]">{nameLine}</p>
            {email ? (
              <p className="truncate text-[10px] text-[#5A6E9A]" title={email}>
                {email}
              </p>
            ) : null}
            <span
              className="mt-1 inline-block max-w-full truncate rounded-[99px] border-[0.5px] px-[7px] py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: rs.bg,
                color: rs.color,
                borderColor: rs.border,
              }}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Primary">
          <p className={sectionLabelClass}>Main</p>
          <button type="button" className={navItemClass('dashboard')} onClick={() => go('dashboard')}>
            <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </button>
          <button type="button" className={navItemClass('runs')} onClick={() => go('runs')}>
            <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
            Test Runs
          </button>
          <button type="button" className={navItemClass('new')} onClick={() => go('new')}>
            <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Test Case
          </button>

          <p className={sectionLabelClass}>Library</p>
          <button type="button" className={navItemClass('templates')} onClick={() => go('templates')}>
            <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Template Library
          </button>
          <button type="button" className={navItemClass('all')} onClick={() => go('all')}>
            <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="min-w-0 flex-1 truncate">View All</span>
            <span
              className="ml-auto shrink-0 rounded-[99px] px-1.5 py-0.5 text-[10px] font-medium text-[#1A3263]"
              style={{ background: '#D6E0F5' }}
            >
              {testCaseCount}
            </span>
          </button>

          {showTeamSection ? (
            <>
              <p className={sectionLabelClass}>Team</p>
              <button type="button" className={navItemClass('team')} onClick={() => go('team')}>
                <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                Team
              </button>
              <button type="button" className={navItemClass('activity')} onClick={() => go('activity')}>
                <svg className={iconWrap} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4l3 3" />
                </svg>
                Activity Log
              </button>
            </>
          ) : null}
        </nav>

        {/* Footer */}
        {(showSyncFooter || showImportFooter || showExportFooter) && (
          <div className="shrink-0 border-t-[0.5px] border-[#B0C0E0] bg-white px-3 py-2.5">
            <div className="flex gap-1.5">
              {showSyncFooter ? (
                <button
                  type="button"
                  disabled={syncLoading}
                  onClick={() => {
                    onSyncPrimary()
                    onClose()
                  }}
                  className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border-[0.5px] border-[#B0C0E0] bg-white px-1 text-[11px] text-[#5A6E9A] hover:bg-[#EEF2FB] disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
                  style={{ paddingTop: 7, paddingBottom: 7 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ width: 13, height: 13 }}
                    aria-hidden
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  Sync
                </button>
              ) : null}
              {showImportFooter ? (
                <button
                  type="button"
                  onClick={() => {
                    onImport()
                    onClose()
                  }}
                  className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border-[0.5px] border-[#B0C0E0] bg-white px-1 text-[11px] text-[#5A6E9A] hover:bg-[#EEF2FB] [-webkit-tap-highlight-color:transparent]"
                  style={{ paddingTop: 7, paddingBottom: 7 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ width: 13, height: 13 }}
                    aria-hidden
                  >
                    <path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4-4 4M12 4v12" />
                  </svg>
                  Import
                </button>
              ) : null}
              {showExportFooter ? (
                <button
                  type="button"
                  onClick={() => {
                    onExport()
                    onClose()
                  }}
                  className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border-[0.5px] border-[#B0C0E0] bg-white px-1 text-[11px] text-[#5A6E9A] hover:bg-[#EEF2FB] [-webkit-tap-highlight-color:transparent]"
                  style={{ paddingTop: 7, paddingBottom: 7 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ width: 13, height: 13 }}
                    aria-hidden
                  >
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
                  </svg>
                  Export
                </button>
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
