'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Web Speech API type declarations (not in standard TS DOM lib) ──
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface UseSpeechToTextOptions {
  maxDuration?: number // seconds, default 30
}

interface UseSpeechToTextReturn {
  isSupported: boolean
  isListening: boolean
  transcript: string
  timeLeft: number // seconds remaining
  error: string | null
  startListening: () => void
  stopAndKeep: () => void   // stop recording, keep transcript in place
  cancelListening: () => void // stop recording, clear transcript
}

// Check browser support once
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return win.SpeechRecognition || win.webkitSpeechRecognition || null
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { maxDuration = 30 } = options

  const [isSupported] = useState(() => getSpeechRecognition() !== null)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [timeLeft, setTimeLeft] = useState(maxDuration)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptRef = useRef('') // keeps final+interim for reading in callbacks
  const isCancelledRef = useRef(false)

  // Clean up all timers
  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoSubmitRef.current) { clearTimeout(autoSubmitRef.current); autoSubmitRef.current = null }
  }, [])

  // Stop the recognition engine
  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* already stopped */ }
      recognitionRef.current = null
    }
    clearTimers()
    setIsListening(false)
  }, [clearTimers])

  // Start listening
  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition()
    if (!SpeechRecognitionClass) {
      setError('Speech recognition is not supported in this browser.')
      return
    }

    // Reset state
    setError(null)
    setTranscript('')
    transcriptRef.current = ''
    isCancelledRef.current = false
    setTimeLeft(maxDuration)

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' '
        } else {
          interim += result[0].transcript
        }
      }
      const combined = (finalTranscript + interim).trim()
      transcriptRef.current = combined
      setTranscript(combined)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isCancelledRef.current) return // ignore errors from manual abort
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access denied. Please allow microphone access.')
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Try again.')
      } else if (event.error !== 'aborted') {
        setError(`Speech error: ${event.error}`)
      }
      stopRecognition()
    }

    recognition.onend = () => {
      // Recognition ended (could be auto-stop from browser, or our manual stop)
      // Only update state — the caller decides what to do with the transcript
      setIsListening(false)
      clearTimers()
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setIsListening(true)

      // Countdown timer (visual)
      let remaining = maxDuration
      timerRef.current = setInterval(() => {
        remaining -= 1
        setTimeLeft(remaining)
        if (remaining <= 0) {
          clearTimers()
        }
      }, 1000)

      // Auto-stop after maxDuration
      autoSubmitRef.current = setTimeout(() => {
        stopRecognition()
        // transcript stays in state — parent component decides to auto-submit
      }, maxDuration * 1000)
    } catch {
      setError('Failed to start speech recognition.')
      stopRecognition()
    }
  }, [maxDuration, stopRecognition, clearTimers])

  // Stop and keep transcript (user wants to edit or submit)
  const stopAndKeep = useCallback(() => {
    stopRecognition()
  }, [stopRecognition])

  // Cancel — stop and clear everything
  const cancelListening = useCallback(() => {
    isCancelledRef.current = true
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    clearTimers()
    setIsListening(false)
    setTranscript('')
    transcriptRef.current = ''
    setTimeLeft(maxDuration)
    setError(null)
  }, [clearTimers, maxDuration])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* ignore */ }
      }
      clearTimers()
    }
  }, [clearTimers])

  return {
    isSupported,
    isListening,
    transcript,
    timeLeft,
    error,
    startListening,
    stopAndKeep,
    cancelListening,
  }
}

