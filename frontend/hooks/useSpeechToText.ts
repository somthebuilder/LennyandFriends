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
  /** Max silence gap in seconds before auto-stopping (default 3) */
  silenceTimeout?: number
  /** Absolute max duration in seconds as a safety net (default 120) */
  maxDuration?: number
}

interface UseSpeechToTextReturn {
  isSupported: boolean
  isListening: boolean
  transcript: string
  elapsed: number // seconds since recording started
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
  const { silenceTimeout = 3, maxDuration = 120 } = options

  const [isSupported, setIsSupported] = useState(false)

  // Detect browser support after mount to avoid SSR hydration mismatch
  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null)
  }, [])
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptRef = useRef('')
  const isCancelledRef = useRef(false)

  // Clean up all timers
  const clearTimers = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
    if (maxRef.current) { clearTimeout(maxRef.current); maxRef.current = null }
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

  // Reset the silence timer (called every time new speech arrives)
  const resetSilenceTimer = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current)
    silenceRef.current = setTimeout(() => {
      // 3 seconds of silence → auto-stop
      stopRecognition()
    }, silenceTimeout * 1000)
  }, [silenceTimeout, stopRecognition])

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
    setElapsed(0)

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

      // Speech detected → reset the silence timer
      resetSilenceTimer()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isCancelledRef.current) return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access denied. Please allow microphone access.')
      } else if (event.error === 'no-speech') {
        // Don't show an error — just stop gracefully
        stopRecognition()
        return
      } else if (event.error !== 'aborted') {
        setError(`Speech error: ${event.error}`)
      }
      stopRecognition()
    }

    recognition.onend = () => {
      setIsListening(false)
      clearTimers()
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setIsListening(true)

      // Elapsed-time tick (counts up)
      let secs = 0
      tickRef.current = setInterval(() => {
        secs += 1
        setElapsed(secs)
      }, 1000)

      // Start the initial silence timer (auto-stop if no speech at all)
      resetSilenceTimer()

      // Safety-net max duration
      maxRef.current = setTimeout(() => {
        stopRecognition()
      }, maxDuration * 1000)
    } catch {
      setError('Failed to start speech recognition.')
      stopRecognition()
    }
  }, [maxDuration, stopRecognition, clearTimers, resetSilenceTimer])

  // Stop and keep transcript
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
    setElapsed(0)
    setError(null)
  }, [clearTimers])

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
    elapsed,
    error,
    startListening,
    stopAndKeep,
    cancelListening,
  }
}
