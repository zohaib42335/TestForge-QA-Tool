/**
 * TabNav — Underline tab strip for primary app navigation.
 * @param {Object} props
 * @param {'dashboard'|'runs'|'new'|'templates'|'all'|'team'|'activity'|'settings'} props.activeTab
 * @param {(tab: 'dashboard'|'runs'|'new'|'templates'|'all'|'team'|'activity'|'settings') => void} props.onTabChange
 * @param {number} props.testCaseCount
 * @param {boolean} [props.showTeamTab] - When true, show Admin-only Team tab
 * @param {boolean} [props.showActivityTab] - When true, show Admin/QA Lead Activity tab
 */

/** @typedef {'dashboard'|'runs'|'new'|'templates'|'all'|'team'|'activity'|'bugs'|'settings'} TabKey */

export default function TabNav({
  activeTab,
  onTabChange,
  testCaseCount,
  showNewTab = true,
  showTeamTab = false,
  showActivityTab = false,
  showSettingsTab = false,
  bugCount = 0,
}) {
  /** @type {Array<{ key: TabKey, label: string }>} */
  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'runs', label: 'Test Runs' },
    ...(showNewTab ? [{ key: /** @type {TabKey} */ ('new'), label: 'New Test Case' }] : []),
    { key: 'templates', label: 'Template Library' },
    { key: 'all', label: 'View All' },
    { key: 'bugs', label: 'Bug Tracker' },
    ...(showTeamTab ? [{ key: /** @type {TabKey} */ ('team'), label: 'Team' }] : []),
    ...(showActivityTab ? [{ key: /** @type {TabKey} */ ('activity'), label: 'Activity' }] : []),
    ...(showSettingsTab ? [{ key: /** @type {TabKey} */ ('settings'), label: 'Settings' }] : []),
  ]

  return (
    <div className="hidden md:flex w-full flex-col border-b border-[#B0C0E0] bg-white px-4 shadow-none">
      <div className="scrollbar-hide -mx-3 flex flex-nowrap items-stretch gap-0 overflow-x-auto md:mx-0 md:overflow-visible">
        <div className="flex min-h-0 min-w-0 flex-nowrap md:w-full">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                data-tour={`tab-${tab.key}`}
                aria-label={tab.label}
                title={tab.label}
                className={`inline-flex min-h-[44px] shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent px-3 text-[13px] transition-[color,border-color] duration-150 ease-in-out md:h-11 md:min-h-0 md:px-4 ${
                  isActive
                    ? 'cursor-pointer border-[#1A3263] font-medium text-[#1A3263]'
                    : 'cursor-pointer border-transparent font-normal text-[#5A6E9A] hover:border-[#B0C0E0] hover:text-[#1A3263]'
                }`}
              >
                {tab.key === 'dashboard' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M4 13h6V4H4v9zm10 7h6V11h-6v9zM4 20h6v-5H4v5zm10-9h6V4h-6v7z" />
                  </svg>
                )}
                {tab.key === 'runs' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M5 3l14 9-14 9V3z" />
                  </svg>
                )}
                {tab.key === 'new' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
                {tab.key === 'templates' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                )}
                {tab.key === 'all' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
                {tab.key === 'team' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                )}
                {tab.key === 'activity' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
                {tab.key === 'bugs' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
                {tab.key === 'settings' && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-[14px] w-[14px] shrink-0"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                )}
                <span className="hidden md:inline">{tab.label}</span>
                {tab.key === 'all' && (
                  <span className="rounded-full bg-[#D6E0F5] px-1.5 py-[1px] text-[10px] font-medium text-[#1A3263] md:ml-0.5">
                    {testCaseCount}
                  </span>
                )}
                {tab.key === 'bugs' && bugCount > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-[1px] text-[10px] font-medium text-red-600 md:ml-0.5">
                    {bugCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
