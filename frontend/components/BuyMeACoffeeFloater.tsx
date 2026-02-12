'use client'

import { useState, useEffect } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

interface BuyMeACoffeeFloaterProps {
  /** Buy Me a Coffee page URL — pass once you have your account link */
  href?: string
}

export default function BuyMeACoffeeFloater({
  href = 'https://buymeacoffee.com/shivsom',
}: BuyMeACoffeeFloaterProps) {
  // Prevent hydration mismatch by only rendering on client
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null // Don't render anything during SSR
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Buy me a coffee"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden hover:scale-105 active:scale-95 shadow-lg shadow-charcoal-900/10 hover:shadow-xl transition-all duration-200"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <DotLottieReact
        src="/Buymeacoffeebadge.lottie"
        loop
        autoplay
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </a>
  )
}

