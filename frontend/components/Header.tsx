'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AuthModal from './AuthModal'

export default function Header() {
  const [hasAccount, setHasAccount] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHasAccount(localStorage.getItem('espresso_has_account') === '1')
  }, [])

  return (
    <>
      <header className="sticky top-0 z-40 bg-cream-50/90 backdrop-blur-xl border-b border-espresso-200/30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <img src="/espressologo.png" alt="" className="w-7 h-7 object-contain transition-transform duration-300 group-hover:scale-105" />
            <span className="font-cafe italic text-lg text-espresso-600 group-hover:text-espresso-500 transition-colors select-none">
              espresso
            </span>
          </Link>

          {/* Auth — only Sign In or user info */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAuth(true)}
              className="text-xs font-medium text-charcoal-500 hover:text-espresso-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-espresso-50/60"
            >
              {hasAccount ? 'Continue' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        initialMode="signin"
      />
    </>
  )
}
