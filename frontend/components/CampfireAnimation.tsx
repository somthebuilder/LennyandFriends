'use client'

import { useRive } from '@rive-app/react-canvas'
import { useState, useEffect } from 'react'

export default function CampfireAnimation({ 
  className = "w-full h-full",
  autoplay = true 
}: { 
  className?: string
  autoplay?: boolean 
}) {
  const [error, setError] = useState(false)
  
  const { RiveComponent, rive } = useRive({
    src: '/campfire.riv',
    autoplay: autoplay,
    // Try common state machine names, or leave undefined to use default
    // stateMachines: 'State Machine 1',
    onLoadError: () => {
      console.warn('Rive animation failed to load')
      setError(true)
    },
  })

  // Ensure animation loops continuously
  useEffect(() => {
    if (rive) {
      // Rive animations loop by default if configured in editor
      // Ensure continuous playback
      rive.play()
      
      // Check periodically to ensure it keeps playing (for looping)
      const interval = setInterval(() => {
        if (rive && !rive.isPlaying) {
          rive.play()
        }
      }, 100)
      
      return () => clearInterval(interval)
    }
  }, [rive])

  if (error) {
    return (
      <div className={className} style={{ minHeight: '400px', minWidth: '400px' }}>
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fire-200 to-flame-200 rounded-full">
          <div className="text-fire-600 text-sm">Animation loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: '100vh' }}>
      <RiveComponent />
    </div>
  )
}

