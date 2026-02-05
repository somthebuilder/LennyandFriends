'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode?: 'signin' | 'signup'
}

export default function AuthModal({ isOpen, onClose, onSuccess, mode = 'signin' }: AuthModalProps) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(mode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setIsLoading(true)

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        })

        if (error) throw error

        if (data.user) {
          setMessage('Check your email to confirm your account!')
          setTimeout(() => {
            onClose()
          }, 3000)
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        if (data.user) {
          onSuccess()
          onClose()
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-charcoal-400 hover:text-charcoal-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-charcoal-700 mb-2">
            {authMode === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-charcoal-600">
            {authMode === 'signin'
              ? 'Sign in to vote for podcasts and submit requests'
              : 'Join to vote for podcasts and submit requests'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-charcoal-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-charcoal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-charcoal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-charcoal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-charcoal-600">
          {authMode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => setAuthMode('signup')}
                className="text-orange-600 font-medium hover:text-orange-700"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setAuthMode('signin')}
                className="text-orange-600 font-medium hover:text-orange-700"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

