import { useRole } from '../hooks/useRole'

export default function Unauthorized() {
  const { userRole } = useRole()

  return (
    <div className="min-h-screen bg-[#EEF2FB] px-4 py-10">
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-[#D6E0F5] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF2FB] text-[#1A3263]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden>
            <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
            <rect x="9" y="10" width="6" height="5" rx="1" />
            <path d="M10 10V9a2 2 0 114 0v1" />
          </svg>
        </div>

        <h1 className="mt-4 text-2xl font-semibold text-[#1A3263]">Access Restricted</h1>
        <p className="mt-2 text-sm text-[#5A6E9A]">
          You don&apos;t have permission to view this page. Contact your project Admin.
        </p>

        <p className="mt-4 text-xs font-medium text-[#5A6E9A]">
          Your role: <span className="text-[#1A3263]">{userRole ?? 'Unknown'}</span>
        </p>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.history.back()
          }}
          className="mt-6 rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247]"
        >
          ← Go Back
        </button>
      </div>
    </div>
  )
}

