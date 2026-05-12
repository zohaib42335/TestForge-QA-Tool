/**
 * @fileoverview Lightweight toast notifications (bottom-right, 3s auto-dismiss).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/** @typedef {'success' | 'success-pass' | 'success-fail' | 'success-blocked' | 'success-notrun' | 'orange' | 'error' | 'neutral'} ToastVariant */

const ToastContext = createContext(
  /** @type {((message: string, variant?: ToastVariant) => void) | null} */ (null),
)

/**
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 */
export function ToastProvider({ children }) {
  /** @type {[{ id: number, message: string, variant: ToastVariant } | null, import('react').Dispatch<any>]} */
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ id: Date.now(), message: String(message), variant })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const value = useMemo(() => showToast, [showToast])

  const styles =
    toast?.variant === 'success' || toast?.variant === 'success-pass'
      ? 'border-green-200 bg-[#DCFCE7] text-[#166534] border-l-[#16A34A]'
      : toast?.variant === 'success-fail'
        ? 'border-red-200 bg-[#FEE2E2] text-[#991B1B] border-l-[#DC2626]'
        : toast?.variant === 'success-blocked'
          ? 'border-amber-200 bg-[#FEF3C7] text-[#92400E] border-l-[#D97706]'
          : toast?.variant === 'success-notrun'
            ? 'border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263] border-l-[#9CA3AF]'
            : toast?.variant === 'orange'
              ? 'border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263] border-l-[#1A3263]'
              : toast?.variant === 'error'
                ? 'border-red-200 bg-[#FEE2E2] text-[#991B1B] border-l-[#DC2626]'
                : 'border-[#B0C0E0] bg-[#EEF2FB] text-[#5A6E9A] border-l-[#8A9BBF]'

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[90] max-w-sm w-[min(92vw,20rem)] rounded-lg border border-l-4 px-4 py-3 text-sm shadow-md ${styles}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/**
 * @returns {(message: string, variant?: ToastVariant) => void}
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
