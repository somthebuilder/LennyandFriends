'use client'

import { useState, useEffect } from 'react'

interface LoadingStateProps {
  question: string
}

const loadingSteps = [
  { text: 'Analyzing question...', icon: '🌀', duration: 1000 },
  { text: 'Context understood', icon: '✓', duration: 1000 },
  { text: 'Searching panel conversations...', icon: '🔍', duration: 2000 },
  { text: 'Gathering expert perspectives...', icon: '⚡', duration: 2000 },
]

export default function LoadingState({ question }: LoadingStateProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (currentStep >= loadingSteps.length) return

    const step = loadingSteps[currentStep]
    const timer = setTimeout(() => {
      setCurrentStep(prev => prev + 1)
    }, step.duration)

    return () => clearTimeout(timer)
  }, [currentStep])

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 100)
    }, 100)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-8">
      {/* Question Display */}
      <div className="editorial-card p-6 bg-white border border-charcoal-100">
        <label className="text-sm font-semibold text-charcoal-500 uppercase tracking-wider mb-2 block">
          Your Question:
        </label>
        <p className="text-lg text-charcoal-900">{question}</p>
      </div>

      {/* Loading Animation */}
      <div className="editorial-card p-12 bg-white border border-charcoal-100 text-center">
        {/* Portal Animation Placeholder */}
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 animate-spin" style={{
            background: 'conic-gradient(from 0deg, #fb923c, #f97316, #ea580c, #fb923c)',
            animation: 'spin 2s linear infinite',
          }}></div>
        </div>

        {/* Loading Steps */}
        <div className="space-y-4">
          {loadingSteps.map((step, index) => {
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            
            return (
              <div
                key={index}
                className={`flex items-center justify-center gap-3 transition-all duration-500 ${
                  isActive 
                    ? 'opacity-100 scale-100' 
                    : isCompleted 
                    ? 'opacity-60 scale-95' 
                    : 'opacity-30 scale-90'
                }`}
              >
                <span className="text-2xl">{step.icon}</span>
                <span className={`text-lg font-medium ${
                  isActive ? 'text-charcoal-900' : 'text-charcoal-500'
                }`}>
                  {step.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

