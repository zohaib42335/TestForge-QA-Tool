/**
 * StatusBadge — Displays a colored badge for test case status or priority.
 * @param {Object} props
 * @param {string} props.value - The status/priority string
 * @param {string} props.type - 'status' | 'priority' | 'severity'
 */

/**
 * @param {string} type
 * @param {string} value
 * @returns {{ badge: string, dot: string }}
 */
function getColorClasses(type, value) {
  const v = value == null ? '' : String(value)

  if (type === 'status') {
    if (v === 'Pass') return { badge: 'bg-green-100 text-green-700', dot: 'bg-green-600' }
    if (v === 'Fail') return { badge: 'bg-red-100 text-red-700', dot: 'bg-red-600' }
    if (v === 'Blocked')
      return { badge: 'bg-[#FEF3C7] text-[#92400E]', dot: 'bg-[#D97706]' }
    if (v === 'Not Executed' || v === 'Not Run')
      return { badge: 'bg-[#EEF2FB] text-[#1A3263]', dot: 'bg-[#1A3263]' }
    return { badge: 'bg-[#F1F5F9] text-[#5A6E9A]', dot: 'bg-[#9CA3AF]' }
  }

  if (type === 'priority') {
    if (v === 'Critical') return { badge: 'bg-red-100 text-red-700', dot: 'bg-red-600' }
    if (v === 'High') return { badge: 'bg-red-100 text-red-700', dot: 'bg-red-600' }
    if (v === 'Medium') return { badge: 'bg-[#FEF3C7] text-[#92400E]', dot: 'bg-[#D97706]' }
    if (v === 'Low') return { badge: 'bg-green-100 text-green-700', dot: 'bg-green-600' }
    return { badge: 'bg-[#F1F5F9] text-[#5A6E9A]', dot: 'bg-[#9CA3AF]' }
  }

  if (type === 'severity') {
    if (v === 'Critical') return { badge: 'bg-red-100 text-red-700', dot: 'bg-red-600' }
    if (v === 'Major') return { badge: 'bg-red-100 text-red-700', dot: 'bg-red-600' }
    if (v === 'Minor') return { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
    if (v === 'Trivial') return { badge: 'bg-[#F1F5F9] text-[#5A6E9A]', dot: 'bg-[#9CA3AF]' }
    return { badge: 'bg-[#F1F5F9] text-[#5A6E9A]', dot: 'bg-[#9CA3AF]' }
  }

  return { badge: 'bg-[#F1F5F9] text-[#5A6E9A]', dot: 'bg-[#9CA3AF]' }
}

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {'status' | 'priority' | 'severity'} props.type
 */
export default function StatusBadge({ value, type }) {
  const display = value == null || value === '' ? '—' : String(value)
  const { badge, dot } = getColorClasses(type, display === '—' ? '' : display)

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${badge}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden />
      {display}
    </span>
  )
}
