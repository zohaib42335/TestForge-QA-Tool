import type { Role } from '../../constants/rbac'

type Props = {
  role: Role
}

const ROLE_STYLES: Record<Role, string> = {
  Owner: 'border-[#D8B4FE] bg-[#F3E8FF] text-[#6B21A8]',
  Admin: 'border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263]',
  'QA Lead': 'border-[#FDBA74] bg-[#FFEDD5] text-[#9A3412]',
  Member: 'border-[#86EFAC] bg-[#DCFCE7] text-[#166534]',
  Viewer: 'border-[#CBD5E1] bg-[#F1F5F9] text-[#334155]',
}

export default function RoleBadge({ role }: Props) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.Member
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${style}`}
    >
      {role}
    </span>
  )
}

