/**
 * Lightweight full-width placeholder while workspace / project context loads.
 */
export default function PageSkeleton() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col gap-4 px-4 py-10" aria-busy aria-label="Loading">
      <div className="mx-auto w-full max-w-4xl space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[#D6E0F5]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-[#EEF2FB]" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-xl border border-[#B0C0E0]/40 bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-[#B0C0E0]/40 bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-[#B0C0E0]/40 bg-white sm:col-span-2" />
        </div>
      </div>
    </div>
  )
}
