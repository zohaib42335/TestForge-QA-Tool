/**
 * Small connectivity pill: green when online, amber + “Working offline” when not.
 * @param {Object} props
 * @param {boolean} props.isOnline
 * @param {string} [props.className] - Optional positioning / layout classes
 */

export default function ConnectionStatus({ isOnline, className = '' }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-[#B0C0E0] bg-white px-2.5 py-1 shadow-sm ${className}`.trim()}
      role="status"
      aria-live="polite"
      title={isOnline ? 'Connected to Firebase' : 'Working offline'}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          isOnline ? 'bg-green-500' : 'bg-amber-500'
        }`}
        aria-hidden
      />
      {isOnline ? (
        <span className="sr-only">Connected</span>
      ) : (
        <span className="text-[11px] font-medium text-amber-800">Working offline</span>
      )}
    </div>
  )
}
