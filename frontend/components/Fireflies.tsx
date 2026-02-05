'use client'

import { useEffect, useRef } from 'react'

interface Firefly {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  glow: number
}

export default function Fireflies({ count = 8 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const firefliesRef = useRef<Firefly[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Initialize fireflies
    const initFireflies = () => {
      firefliesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 2,
        opacity: Math.random() * 0.5 + 0.3,
        glow: Math.random() * 0.5 + 0.5,
      }))
    }
    initFireflies()

    // Animation loop
    let animationFrame: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      firefliesRef.current.forEach((firefly) => {
        // Update position
        firefly.x += firefly.vx
        firefly.y += firefly.vy

        // Bounce off edges
        if (firefly.x < 0 || firefly.x > canvas.width) firefly.vx *= -1
        if (firefly.y < 0 || firefly.y > canvas.height) firefly.vy *= -1

        // Keep within bounds
        firefly.x = Math.max(0, Math.min(canvas.width, firefly.x))
        firefly.y = Math.max(0, Math.min(canvas.height, firefly.y))

        // Animate glow
        firefly.glow += 0.02
        if (firefly.glow > 1) firefly.glow = 0

        // Draw firefly with glow
        const glowSize = firefly.size * (2 + Math.sin(firefly.glow * Math.PI * 2))
        const gradient = ctx.createRadialGradient(
          firefly.x,
          firefly.y,
          0,
          firefly.x,
          firefly.y,
          glowSize * 2
        )
        gradient.addColorStop(0, `rgba(251, 146, 60, ${firefly.opacity})`)
        gradient.addColorStop(0.5, `rgba(251, 146, 60, ${firefly.opacity * 0.3})`)
        gradient.addColorStop(1, 'rgba(251, 146, 60, 0)')

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(firefly.x, firefly.y, glowSize * 2, 0, Math.PI * 2)
        ctx.fill()

        // Draw firefly core
        ctx.fillStyle = `rgba(251, 191, 36, ${firefly.opacity + Math.sin(firefly.glow * Math.PI * 2) * 0.2})`
        ctx.beginPath()
        ctx.arc(firefly.x, firefly.y, firefly.size, 0, Math.PI * 2)
        ctx.fill()
      })

      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrame)
    }
  }, [count])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  )
}

