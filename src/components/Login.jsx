/**
 * Login — Firebase authentication UI (Google + email/password + register).
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { LogoStacked } from './Logo.jsx'
import { capturePendingInviteFromUrl } from '../utils/pendingInviteStorage.js'

const inputClass =
  'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2.5 w-full focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'
const labelClass = 'block text-sm text-[#5A6E9A] mb-1.5'

/**
 * @returns {import('react').JSX.Element}
 */
export default function Login() {
  const {
    configError,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(/** @type {'signin' | 'register'} */ ('signin'))
  const [formHint, setFormHint] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    capturePendingInviteFromUrl()
  }, [])

  /**
   * @param {import('react').FormEvent} e
   */
  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    clearAuthError()
    setFormHint('')
    if (!email.trim()) {
      setFormHint('Please enter your email address.')
      return
    }
    if (!password) {
      setFormHint('Please enter your password.')
      return
    }
    if (mode === 'register') {
      const n = registerName.trim()
      if (!n) {
        setFormHint('Please enter your name.')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmailPassword(email, password)
      } else {
        await registerWithEmailPassword(email, password, registerName.trim())
      }
    } finally {
      setBusy(false)
    }
  }

  /**
   * @returns {Promise<void>}
   */
  const handleGoogle = async () => {
    clearAuthError()
    setBusy(true)
    try {
      await signInWithGoogle()
    } finally {
      setBusy(false)
    }
  }

  const showError = configError || authError
  const disableForm = busy || !!configError

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#EEF2FB] text-[#1A3263]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <LogoStacked size="lg" />
          </div>
          <p className="text-sm text-[#5A6E9A] mt-1">Sign in to manage test cases</p>
        </div>

        <div className="bg-white border border-[#B0C0E0] rounded-2xl p-8 shadow-sm">
          {(showError || formHint) && (
            <div
              className={`mb-6 rounded-lg px-4 py-3 text-sm border-l-4 ${
                formHint && !showError
                  ? 'bg-amber-50 border-amber-500 text-amber-800 border border-amber-200'
                  : 'bg-red-50 border-red-500 text-red-800 border border-red-200'
              }`}
              role="alert"
            >
              {formHint && !showError ? formHint : configError || authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={disableForm}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border-[0.5px] border-[#B0C0E0] bg-white text-[#1A3263] font-semibold text-sm hover:bg-[#EEF2FB] hover:border-[#4169C4] transition disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#B0C0E0]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-white px-3 text-[#5A6E9A] font-mono">or</span>
            </div>
          </div>

          <div className="flex rounded-lg border border-[#B0C0E0] p-0.5 mb-4 bg-[#EEF2FB]/80">
            <button
              type="button"
              onClick={() => {
                clearAuthError()
                setFormHint('')
                setMode('signin')
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                mode === 'signin'
                  ? 'bg-[#1A3263] text-white'
                  : 'text-[#5A6E9A] hover:text-[#1A3263]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                clearAuthError()
                setFormHint('')
                setMode('register')
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                mode === 'register'
                  ? 'bg-[#1A3263] text-white'
                  : 'text-[#5A6E9A] hover:text-[#1A3263]'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label className={labelClass} htmlFor="login-name">
                  Name
                </label>
                <input
                  id="login-name"
                  type="text"
                  autoComplete="name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  disabled={disableForm}
                  className={inputClass}
                  required
                />
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disableForm}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={disableForm}
                  className={`${inputClass} pr-11`}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-[#5A6E9A] hover:bg-[#EEF2FB] hover:text-[#1A3263]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-xs text-[#5A6E9A] mt-1">Minimum 6 characters</p>
              )}
            </div>
            <button
              type="submit"
              disabled={disableForm}
              className="w-full py-3 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white font-semibold text-sm transition disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
            >
              {busy
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign in with email'
                  : 'Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
