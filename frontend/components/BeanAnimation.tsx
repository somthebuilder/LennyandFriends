'use client'

import { useState, useEffect } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

interface BeanAnimationProps {
  size?: number
  className?: string
  loop?: boolean
  autoplay?: boolean
}

export default function BeanAnimation({
  size = 40,
  className = '',
  loop = true,
  autoplay = true,
}: BeanAnimationProps) {
  // Prevent hydration mismatch by only rendering on client
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Return a placeholder with the same dimensions during SSR
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      />
    )
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <DotLottieReact
        src="/bean.lottie"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

