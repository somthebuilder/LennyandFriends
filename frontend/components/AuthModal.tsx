'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

export default function AuthModal({ isOpen, onClose, initialMode = 'signup' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setFullName('')
    setAgreedToTerms(false)
    setError(null)
    setSuccess(null)
  }

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode)
    resetForm()
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.')
      return
    }
    setLoading(true)
    setError(null)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('espresso_has_account', '1')
      setSuccess('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('espresso_has_account', '1')
      onClose()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-charcoal-200 w-full max-w-md p-8 animate-slide-up">
        {/* Close Button */}
        <button
          onClick={onClose}
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
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex mb-6 bg-charcoal-50 rounded-lg p-1">
          <button
            onClick={() => switchMode('signup')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'signup'
                ? 'bg-white text-charcoal-900 shadow-sm'
                : 'text-charcoal-500 hover:text-charcoal-700'
            }`}
          >
            Sign Up
          </button>
          <button
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'signin'
                ? 'bg-white text-charcoal-900 shadow-sm'
                : 'text-charcoal-500 hover:text-charcoal-700'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Sign Up Form */}
        {mode === 'signup' && !success && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                required
                className="input-editorial"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="signupEmail" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Email
              </label>
              <input
                id="signupEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="input-editorial"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="signupPassword" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Password
              </label>
              <input
                id="signupPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                className="input-editorial"
                disabled={loading}
              />
            </div>

            {/* Terms & Privacy */}
            <div className="flex items-start gap-3">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-charcoal-300 text-charcoal-900 focus:ring-charcoal-900/20"
              />
              <label htmlFor="terms" className="text-xs text-charcoal-600 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-charcoal-800 underline underline-offset-2 hover:text-accent-600 transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" className="text-charcoal-800 underline underline-offset-2 hover:text-accent-600 transition-colors">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="btn-primary w-full"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Sign In Form */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="signinEmail" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Email
              </label>
              <input
                id="signinEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="input-editorial"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="signinPassword" className="block text-sm font-medium text-charcoal-700 mb-1.5">
                Password
              </label>
              <input
                id="signinPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="input-editorial"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

      </div>
    </div>
  )
}

