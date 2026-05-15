/**
 * Workspace label + dropdown (placeholder for future multi-project switching).
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * @param {Object} props
 * @param {string} [props.projectName]
 */
export default function ProjectSwitcher({ projectName = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null))

  const full = typeof projectName === 'string' && projectName.trim() ? projectName.trim() : 'Workspace'
  const label = full.length > 10 ? `${full.slice(0, 10)}…` : full

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      const el = rootRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-flex max-w-full flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#B0C0E0]/80 bg-white/90 px-2 py-1 text-left text-[11px] font-medium text-[#1A3263] shadow-sm transition hover:bg-[#EEF2FB] md:text-[12px]"
        aria-expanded={open}
        aria-haspopup="menu"
        title={full}
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3.5 w-3.5 shrink-0 text-[#5A6E9A] transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-[80] mt-1 min-w-[200px] max-w-[min(100vw-24px,260px)] rounded-lg border border-[#B0C0E0] bg-white py-1 shadow-lg"
          role="menu"
        >
          <div
            className="flex items-start gap-2 px-3 py-2 text-[13px] font-bold text-[#1A3263]"
            role="menuitem"
          >
            <span className="mt-0.5 shrink-0 text-green-600" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 break-words" title={full}>
              {full}
            </span>
          </div>
          <div className="my-1 h-px bg-[#EEF2FB]" role="separator" />
          <Link
            to="/settings"
            role="menuitem"
            className="block px-3 py-2 text-[13px] font-medium text-[#1A3263] hover:bg-[#EEF2FB]"
            onClick={() => setOpen(false)}
          >
            Project Settings
          </Link>
        </div>
      ) : null}
    </div>
  )
}
