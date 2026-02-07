'use client'

import { useRive, useStateMachineInput, Layout, Fit, Alignment } from '@rive-app/react-canvas'
import { useEffect } from 'react'

interface ValueMeterProps {
  isValuable: boolean
  onClick?: () => void
  className?: string
}

export default function ValueMeter({ 
  isValuable,
  onClick,
  className = "w-auto h-20"
}: ValueMeterProps) {
  // Use the official @rive-app/react-canvas useRive hook
  const { rive, setCanvasRef } = useRive({
    src: '/valuable.riv',
    autoplay: true, // Autoplay to show the star
    stateMachines: 'State Machine 1',
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    onLoad: () => {
      console.log('✅ Valuable Rive animation loaded!')
    },
    onLoadError: (error) => {
      console.error('❌ Valuable Rive animation failed to load:', error)
    },
  })

  // Get state machine input for triggering the animation
  const triggerInput = useStateMachineInput(rive, 'State Machine 1', 'trigger')
  const clickInput = useStateMachineInput(rive, 'State Machine 1', 'click')
  const valuableInput = useStateMachineInput(rive, 'State Machine 1', 'valuable')
  const pressedInput = useStateMachineInput(rive, 'State Machine 1', 'pressed')

  // Ensure animation plays when loaded
  useEffect(() => {
    if (rive) {
      rive.play()
    }
  }, [rive])

  // Trigger animation when isValuable changes
  useEffect(() => {
    if (!rive) return
    
    // Try different input methods to trigger the animation
    if (isValuable) {
      // Try trigger inputs
      if (triggerInput) {
        triggerInput.fire()
        console.log('Fired triggerInput')
      }
      if (clickInput) {
        clickInput.fire()
        console.log('Fired clickInput')
      }
      if (pressedInput) {
        pressedInput.fire()
        console.log('Fired pressedInput')
      }
      // Try boolean inputs
      if (valuableInput) {
        valuableInput.value = true
        console.log('Set valuableInput to true')
      }
      
      // Ensure animation is playing
      if (!rive.isPlaying) {
        rive.play()
      }
    } else {
      // Reset when unmarked
      if (valuableInput) {
        valuableInput.value = false
      }
    }
  }, [rive, isValuable, triggerInput, clickInput, valuableInput, pressedInput])

  return (
    <div 
      className={className}
      style={{ 
        backgroundColor: 'transparent',
        display: 'inline-block'
      }}
    >
      <canvas 
        ref={setCanvasRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          backgroundColor: 'transparent',
          display: 'block'
        }} 
      />
    </div>
  )
}

