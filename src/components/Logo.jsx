/**
 * TestForge brand — test-plan (clipboard + checklist) mark with wordmark variants.
 *
 * Variants:
 * - LogoFull — mark + “TestForge” wordmark horizontal (navbar).
 * - LogoIcon — mark only (favicon references, compact UI).
 * - LogoStacked — mark above wordmark, centered (login / splash).
 * - LogoLockup — compact mark + wordmark for mobile toolbar (aligned sizes).
 *
 * Styling is inline-only so the component stays portable without Tailwind.
 */

import { useId, useState } from 'react'

/** @typedef {'sm' | 'md' | 'lg'} LogoSize */

/** @type {Record<LogoSize, { icon: number; font: number; gap: number; stackGap: number }>} */
const SIZE_MAP = {
  sm: { icon: 16, font: 15, gap: 7, stackGap: 10 },
  md: { icon: 22, font: 20, gap: 9, stackGap: 12 },
  lg: { icon: 32, font: 30, gap: 11, stackGap: 16 },
}

/**
 * @param {LogoSize} size
 * @returns {{ icon: number; font: number; gap: number; stackGap: number }}
 */
function getSizeTokens(size) {
  return SIZE_MAP[size] ?? SIZE_MAP.md
}

const wordmarkStyleBase = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  letterSpacing: '0.01em',
  lineHeight: 1.15,
  userSelect: 'none',
}

const btnReset = {
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

/**
 * Clipboard + checklist — reads as “test plan / QA cases” at small sizes.
 * @param {{
 *   pixelSize: number
 *   gradientId: string
 *   interactive?: boolean
 *   hovered?: boolean
 *   decorative?: boolean
 *   variant?: 'gradient' | 'inverse'
 * }} props
 */
function TestPlanGlyph({ pixelSize, gradientId, interactive, hovered, decorative, variant = 'gradient' }) {
  const scaleStyle =
    interactive === true
      ? {
          transform: hovered ? 'scale(1.05)' : 'scale(1)',
          transformOrigin: 'center center',
          transition: 'transform 0.2s ease',
          display: 'inline-flex',
        }
      : { display: 'inline-flex' }

  const svgA11y =
    decorative === true
      ? { 'aria-hidden': true }
      : { role: 'img', 'aria-label': 'TestForge — test case management' }

  const isInverse = variant === 'inverse'

  return (
    <span style={scaleStyle}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 32 32"
        style={{ display: 'block', flexShrink: 0 }}
        {...svgA11y}
      >
        {decorative !== true && <title>TestForge</title>}
        {!isInverse ? (
          <>
            <defs>
              <linearGradient
                id={gradientId}
                x1="16"
                y1="2"
                x2="16"
                y2="30"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#1A3263" />
                <stop offset="55%" stopColor="#1A3263" />
                <stop offset="100%" stopColor="#122247" />
              </linearGradient>
            </defs>
            <rect
              x="2"
              y="2"
              width="28"
              height="28"
              rx="7"
              fill={`url(#${gradientId})`}
              stroke="rgba(26, 50, 99, 0.32)"
              strokeWidth="0.85"
            />
            <path
              d="M11 7.5h10a2 2 0 012 2V10H9V9.5a2 2 0 012-2z"
              fill="#122247"
              opacity="0.92"
            />
            <rect x="7" y="9.5" width="18" height="19" rx="2" fill="white" opacity="0.96" />
            <circle cx="10.5" cy="15" r="1.35" fill="none" stroke="#B0C0E0" strokeWidth="1.1" />
            <line x1="13.5" y1="15" x2="23" y2="15" stroke="#D6D3D1" strokeWidth="1.15" strokeLinecap="round" />
            <path
              d="M8.2 19.2l1.35 1.35 2.9-3.1"
              fill="none"
              stroke="#4169C4"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="13.5" y1="19" x2="23" y2="19" stroke="#D6D3D1" strokeWidth="1.15" strokeLinecap="round" />
            <path
              d="M8.2 23.3l1.35 1.25 2.9-2.95"
              fill="none"
              stroke="#4169C4"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="13.5" y1="23" x2="21" y2="23" stroke="#D6D3D1" strokeWidth="1.15" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="6" y="5" width="20" height="23" rx="2.5" fill="rgba(255,255,255,0.22)" />
            <path
              d="M11 5.5h10a2 2 0 012 2V8H9V7.5a2 2 0 012-2z"
              fill="rgba(255,255,255,0.35)"
            />
            <rect x="9" y="9" width="14" height="16" rx="1.5" fill="rgba(255,255,255,0.95)" />
            <circle cx="11.8" cy="14.2" r="1.2" fill="none" stroke="#B0C0E0" strokeWidth="1" />
            <line x1="14.2" y1="14.2" x2="21" y2="14.2" stroke="#D6D3D1" strokeWidth="1" strokeLinecap="round" />
            <path
              d="M9.5 18.2l1.1 1.1 2.4-2.5"
              fill="none"
              stroke="#1A3263"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="14.2" y1="18" x2="21" y2="18" stroke="#D6D3D1" strokeWidth="1" strokeLinecap="round" />
            <path
              d="M9.5 22.2l1.1 1 2.4-2.4"
              fill="none"
              stroke="#1A3263"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="14.2" y1="22" x2="20" y2="22" stroke="#D6D3D1" strokeWidth="1" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  )
}

/**
 * @param {{ fontSize: number }} props
 */
export function Wordmark({ fontSize }) {
  return (
    <span style={{ ...wordmarkStyleBase, fontSize }}>
      <span style={{ fontWeight: 400, color: '#5A6E9A' }}>Test</span>
      <span style={{ fontWeight: 700, color: '#1A3263' }}>Forge</span>
    </span>
  )
}

/**
 * Wordmark for saturated headers (sidebar).
 * @param {{ fontSize?: number }} props
 */
export function WordmarkOnBrand({ fontSize = 15 }) {
  return (
    <span style={{ ...wordmarkStyleBase, fontSize }}>
      <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.9)' }}>Test</span>
      <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Forge</span>
    </span>
  )
}

/**
 * Mark + wordmark with icon size tuned to the wordmark font (same ratios as LogoFull sm/md).
 * @param {{
 *   iconSize: number
 *   fontSize: number
 *   tone?: 'onLight' | 'onBrand'
 *   className?: string
 * }} props
 */
export function LogoLockup({ iconSize, fontSize, tone = 'onLight', className = '' }) {
  const gradId = useId().replace(/:/g, '')
  const gap = Math.max(6, Math.round(fontSize * 0.42))
  const glyphVariant = tone === 'onBrand' ? 'inverse' : 'gradient'
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap,
        verticalAlign: 'middle',
        lineHeight: 0,
      }}
    >
      <TestPlanGlyph
        pixelSize={iconSize}
        gradientId={gradId}
        decorative
        variant={glyphVariant}
      />
      {tone === 'onBrand' ? (
        <WordmarkOnBrand fontSize={fontSize} />
      ) : (
        <Wordmark fontSize={fontSize} />
      )}
    </div>
  )
}

/**
 * Full horizontal logo: icon + wordmark.
 * @param {{ size?: LogoSize; className?: string; onClick?: () => void }} props
 */
export function LogoFull({ size = 'md', className = '', onClick }) {
  const tokens = getSizeTokens(size)
  const gradId = useId().replace(/:/g, '')
  const [hovered, setHovered] = useState(false)

  const rowStyle = {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.gap,
    verticalAlign: 'middle',
  }

  const inner = (
    <>
      <TestPlanGlyph
        pixelSize={tokens.icon}
        gradientId={gradId}
        interactive
        hovered={hovered}
        decorative
        variant="gradient"
      />
      <span className="hidden md:inline" aria-hidden="true">
        <Wordmark fontSize={tokens.font} />
      </span>
    </>
  )

  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={{ ...btnReset, ...rowStyle }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="TestForge"
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={className}
      style={rowStyle}
      role="img"
      aria-label="TestForge logo"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {inner}
    </div>
  )
}

/**
 * Icon-only mark.
 * @param {{ size?: LogoSize; className?: string; onClick?: () => void }} props
 */
export function LogoIcon({ size = 'md', className = '', onClick }) {
  const tokens = getSizeTokens(size)
  const gradId = useId().replace(/:/g, '')
  const [hovered, setHovered] = useState(false)

  const wrapStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
  }

  const mark = (
    <TestPlanGlyph
      pixelSize={tokens.icon}
      gradientId={gradId}
      interactive
      hovered={hovered}
      variant="gradient"
    />
  )

  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={{ ...btnReset, ...wrapStyle }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="TestForge"
      >
        {mark}
      </button>
    )
  }

  return (
    <span
      className={className}
      style={wrapStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {mark}
    </span>
  )
}

/**
 * Stacked logo: icon above wordmark, centered.
 * @param {{ size?: LogoSize; className?: string; onClick?: () => void }} props
 */
export function LogoStacked({ size = 'md', className = '', onClick }) {
  const tokens = getSizeTokens(size)
  const gradId = useId().replace(/:/g, '')

  const colStyle = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: tokens.stackGap,
  }

  const inner = (
    <>
      <TestPlanGlyph
        pixelSize={tokens.icon}
        gradientId={gradId}
        interactive={false}
        decorative
        variant="gradient"
      />
      <span aria-hidden="true">
        <Wordmark fontSize={tokens.font} />
      </span>
    </>
  )

  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={{ ...btnReset, ...colStyle }}
        aria-label="TestForge"
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={className} style={colStyle} role="img" aria-label="TestForge logo">
      {inner}
    </div>
  )
}

export default LogoFull
