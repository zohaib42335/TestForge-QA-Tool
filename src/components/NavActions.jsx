/**
 * NavActions — Compact navbar controls: two grouped dropdowns (“Sync & Export” and “Data”).
 * Manages open/close state, outside-click dismissal, and a confirmation dialog for clearing all test cases.
 * Does not implement business logic; callers pass the same handlers used elsewhere in the app.
 *
 * @param {Object} props
 * @param {() => void} props.onGoogleSheetSync - Connect to Sheets when disconnected, or run sync when connected
 * @param {() => void} props.onExportExcel
 * @param {() => void} props.onImport
 * @param {() => void} props.onClearAll - Invoked only after the user confirms in the dialog
 * @param {boolean} [props.googleSheetsConnected] - When true, first menu item is labeled “Sync to Google Sheets”
 * @param {boolean} [props.syncLoading] - Disables the sync/connect menu action while a sync is in progress
 * @param {() => void} [props.onDisconnectGoogleSheets] - Optional; when connected, shown as a third item (unlink)
 * @param {boolean} [props.showSyncMenu]
 * @param {boolean} [props.showDataMenu]
 * @param {boolean} [props.canImport]
 * @param {boolean} [props.canExport]
 * @param {boolean} [props.canDelete]
 */

import { useCallback, useEffect, useState } from 'react'

/** @param {{ className?: string }} props */
function IconChevronDown({ className = 'h-3 w-3' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** Grid/table — trigger icon for “Sync & Export”. */
function IconSheetsGrid() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  )
}

/** Upload arrow — trigger icon for “Data”. */
function IconUploadArrow() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4-4 4M12 4v12" />
    </svg>
  )
}

const menuPanelClass =
  'absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-lg border-[0.5px] border-[#B0C0E0] bg-white p-1 shadow-none'

const menuItemBaseClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-[7px] text-left text-xs text-[#1A3263] transition-colors hover:bg-[#EEF2FB]'

export default function NavActions({
  onGoogleSheetSync,
  onExportExcel,
  onImport,
  onClearAll,
  googleSheetsConnected = false,
  syncLoading = false,
  onDisconnectGoogleSheets,
  showSyncMenu = true,
  showDataMenu = true,
  canImport = true,
  canExport = true,
  canDelete = true,
}) {
  const [syncOpen, setSyncOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.target instanceof Node && !e.target.closest('.dropdown-wrapper')) {
        setSyncOpen(false)
        setDataOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openSync = useCallback(() => {
    setDataOpen(false)
    setSyncOpen((v) => !v)
  }, [])

  const openData = useCallback(() => {
    setSyncOpen(false)
    setDataOpen((v) => !v)
  }, [])

  const triggerSyncClass =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-[0.5px] border-[#B0C0E0] bg-white text-[#1A3263] hover:bg-[#EEF2FB] hover:border-[#4169C4] md:h-auto md:w-auto md:gap-[5px] md:px-2.5 md:py-[5px] md:text-xs'

  const triggerDataClass =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-[0.5px] border-[#B0C0E0] bg-white text-[#5A6E9A] hover:bg-[#EEF2FB] md:h-auto md:w-auto md:gap-[5px] md:px-2.5 md:py-[5px] md:text-xs'

  return (
    <>
      <div className="hidden md:flex flex-nowrap items-center gap-2">
        {showSyncMenu && (
          <div className="dropdown-wrapper relative" data-tour="sync-export">
            <button
              type="button"
              onClick={openSync}
              className={triggerSyncClass}
              aria-expanded={syncOpen}
              aria-haspopup="true"
              aria-label="Sync and export"
            >
              <IconSheetsGrid />
              <span className="hidden md:inline">Sync &amp; Export</span>
              <IconChevronDown className="hidden h-3 w-3 text-[#1A3263] md:inline" />
            </button>
            {syncOpen && (
              <div className={menuPanelClass} role="menu">
                {canExport && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={syncLoading}
                    className={`${menuItemBaseClass} ${syncLoading ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => {
                      onGoogleSheetSync()
                      setSyncOpen(false)
                    }}
                  >
                    <svg
                      className="h-[14px] w-[14px] shrink-0 text-[#1A3263]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                    <span>
                      {googleSheetsConnected
                        ? 'Sync to Google Sheets'
                        : 'Connect Google Sheets'}
                    </span>
                  </button>
                )}
                {canExport && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemBaseClass}
                    onClick={() => {
                      onExportExcel()
                      setSyncOpen(false)
                    }}
                  >
                    <svg
                      className="h-[14px] w-[14px] shrink-0 text-[#1A3263]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
                    </svg>
                    <span>Export to Excel</span>
                  </button>
                )}
                {canExport &&
                  googleSheetsConnected &&
                  typeof onDisconnectGoogleSheets === 'function' && (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemBaseClass}
                      onClick={() => {
                        onDisconnectGoogleSheets()
                        setSyncOpen(false)
                      }}
                    >
                      <svg
                        className="h-[14px] w-[14px] shrink-0 text-[#1A3263]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M16 8h2a4 4 0 1 1-4 4v-2M8 16H6a4 4 0 1 1 4-4v2M9 9l6 6" />
                      </svg>
                      <span>Disconnect Google Sheets</span>
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {showDataMenu && (
          <div className="dropdown-wrapper relative" data-tour="data-menu">
            <button
              type="button"
              onClick={openData}
              className={triggerDataClass}
              aria-expanded={dataOpen}
              aria-haspopup="true"
              aria-label="Data"
            >
              <IconUploadArrow />
              <span className="hidden md:inline">Data</span>
              <IconChevronDown className="hidden h-3 w-3 text-[#5A6E9A] md:inline" />
            </button>
            {dataOpen && (
              <div className={menuPanelClass} role="menu">
                {canImport && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemBaseClass}
                    onClick={() => {
                      onImport()
                      setDataOpen(false)
                    }}
                  >
                    <svg
                      className="h-[14px] w-[14px] shrink-0 text-[#1A3263]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4-4 4M12 4v12" />
                    </svg>
                    <span>Import Test Cases</span>
                  </button>
                )}
                {canImport && canDelete && (
                  <div
                    className="my-[3px] h-[0.5px] bg-[#B0C0E0]"
                    role="separator"
                  />
                )}
                {canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    className={`${menuItemBaseClass} text-red-600 hover:bg-[#FEE2E2]`}
                    onClick={() => {
                      setDataOpen(false)
                      setClearConfirmOpen(true)
                    }}
                  >
                    <svg
                      className="h-[14px] w-[14px] shrink-0 text-red-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                    </svg>
                    <span className="font-normal">Clear All Test Cases</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clear all confirmation */}
      {clearConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(26,50,99,0.25)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-all-title"
          onClick={() => setClearConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#B0C0E0] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="clear-all-title"
              className="text-lg font-semibold text-[#1A3263]"
            >
              Delete all test cases?
            </h2>
            <p className="mt-2 text-sm text-[#5A6E9A]">
              Are you sure you want to delete all test cases? This cannot be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-[#B0C0E0] bg-white px-4 py-2.5 text-sm font-semibold text-[#5A6E9A] transition hover:bg-[#EEF2FB]"
                onClick={() => setClearConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                onClick={() => {
                  onClearAll()
                  setClearConfirmOpen(false)
                }}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
