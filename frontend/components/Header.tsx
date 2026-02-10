'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'
import type { User } from '@supabase/supabase-js'

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

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
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-espresso-500 hidden sm:block tracking-wide">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-xs font-medium text-charcoal-400 hover:text-espresso-600 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-xs font-medium text-charcoal-500 hover:text-espresso-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-espresso-50/60"
              >
                Sign In
              </button>
            )}
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
