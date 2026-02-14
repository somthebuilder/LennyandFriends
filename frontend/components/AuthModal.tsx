'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const resetForm = () => {
    setEmail('')
    setFullName('')
    setRole('')
    setError(null)
    setSuccess(false)
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback`

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          ...(fullName ? { full_name: fullName } : {}),
          ...(role ? { role } : {}),
        },
      },
    })

    if (otpError) {
      setError(otpError.message)
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('espresso_has_account', '1')
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal-900/40 backdrop-blur-sm"
        onClick={() => { resetForm(); onClose() }}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-charcoal-200 w-full max-w-md p-8 animate-slide-up">
        {/* Close Button */}
        <button
          onClick={() => { resetForm(); onClose() }}
          className="absolute top-4 right-4 text-charcoal-400 hover:text-charcoal-600 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src="/espressologo.png" alt="" className="w-8 h-8 object-contain" />
            <span className="font-cafe italic text-xl text-espresso-700">espresso</span>
          </div>
          <p className="text-sm text-charcoal-500">
            {success ? 'Check your inbox' : 'Sign in with a magic link'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Success state */}
        {success && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal-800 mb-1">
                Magic link sent to
              </p>
              <p className="text-sm font-semibold text-espresso-600">{email}</p>
            </div>
            <p className="text-xs text-charcoal-500 leading-relaxed max-w-xs mx-auto">
              Click the link in the email to sign in. You can close this modal - you&apos;ll be signed in automatically when you click the link.
            </p>
            <button
              onClick={() => { resetForm(); onClose() }}
              className="text-xs font-medium text-charcoal-500 hover:text-espresso-600 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Magic Link Form */}
        {!success && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label htmlFor="magicEmail" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Email
              </label>
              <input
                id="magicEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="input-editorial"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Name <span className="text-charcoal-400 font-normal">(optional)</span>
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="input-editorial"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                What do you do? <span className="text-charcoal-400 font-normal">(optional)</span>
              </label>
              <input
                id="role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Product Manager at Stripe"
                className="input-editorial"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Sending link…' : 'Send Magic Link'}
            </button>

            <p className="text-[11px] text-charcoal-400 text-center leading-relaxed">
              By continuing, you agree to the{' '}
              <Link href="/terms" target="_blank" className="text-charcoal-600 underline underline-offset-2 hover:text-accent-600 transition-colors">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="text-charcoal-600 underline underline-offset-2 hover:text-accent-600 transition-colors">
                Privacy Policy
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
