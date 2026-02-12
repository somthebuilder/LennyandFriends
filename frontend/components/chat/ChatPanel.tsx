'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { sendMessage, ChatMessage } from '@/lib/api/chat'
import { useSpeechToText } from '@/hooks/useSpeechToText'

export default function ChatPanel({ podcastSlug }: { podcastSlug: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    isSupported: micSupported,
    isListening,
    transcript,
    elapsed,
    error: micError,
    startListening,
    stopAndKeep,
    cancelListening,
  } = useSpeechToText({ silenceTimeout: 3, maxDuration: 120 })

  // Sync transcript into input field while recording
  useEffect(() => {
    if (isListening && transcript) {
      setInput(transcript)
    }
  }, [isListening, transcript])

  // Auto-submit when silence auto-stops (isListening goes false, transcript exists)
  const prevListeningRef = useRef(false)
  useEffect(() => {
    // Detect transition from listening → not listening (silence timeout or manual stop)
    if (prevListeningRef.current && !isListening && transcript.trim()) {
      // Transcript stays in input — parent component decides to auto-submit
    }
    prevListeningRef.current = isListening
  }, [isListening, transcript])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const submitMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendMessage(text, podcastSlug)
      setMessages(prev => [...prev, response])
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, podcastSlug])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // If recording, stop first then submit
    if (isListening) {
      stopAndKeep()
      // Use transcript directly since input may not have synced yet
      const text = transcript.trim() || input.trim()
      if (text) submitMessage(text)
      return
    }
    if (input.trim()) submitMessage(input)
  }

  const handleVoiceSubmit = () => {
    // Submit whatever we have and stop
    stopAndKeep()
    const text = transcript.trim() || input.trim()
    if (text) submitMessage(text)
  }

  const handleCancel = () => {
    cancelListening()
    setInput('')
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-charcoal-900/15 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full shadow-lg transition-all duration-300 ${
          open
            ? 'bg-charcoal-800 text-white scale-90'
            : 'bg-accent-600 text-white hover:bg-accent-500 hover:shadow-xl hover:scale-105'
        }`}
      >
        {open ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-medium hidden sm:inline">Ask the Collective</span>
          </>
        )}
      </button>

      {/* Chat Drawer */}
      <div
        className={`fixed bottom-20 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="bg-cream-50 rounded-2xl shadow-2xl flex flex-col h-[520px] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#E5E5E2] flex items-center justify-between">
            <div>
              <h3 className="text-base font-serif font-semibold text-charcoal-900">
                Ask the Collective
              </h3>
              <p className="text-xs text-charcoal-500 mt-0.5">
                Answers grounded in podcast transcripts
              </p>
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 bg-cream-100 text-charcoal-500 rounded-full">
              Beta
            </span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 px-6">
                <p className="text-[13px] text-charcoal-600 max-w-[260px] leading-relaxed">
                  I&apos;m a <span className="font-serif font-semibold">living Bean</span> trained on 500+ hours of conversations with top operators. The more specific your question, the better I can help.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setInput('What books do guests recommend most for PMs?')}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors"
                  >
                    Top PM books
                  </button>
                  <button
                    type="button"
                    onClick={() => setInput('What does Shreyas Doshi say about high-leverage work?')}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors"
                  >
                    Shreyas on leverage
                  </button>
                  <button
                    type="button"
                    onClick={() => setInput('Where do guests disagree on data vs. intuition?')}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors"
                  >
                    Data vs. intuition
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-accent-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm'
                      : 'w-full'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="font-sans">{msg.content}</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-charcoal-700 leading-relaxed">
                          <p>{msg.content}</p>
                        </div>
                        {msg.references && msg.references.length > 0 && (
                          <div className="bg-cream-100 rounded-lg p-2.5 space-y-1.5">
                            <div className="text-[10px] font-semibold text-charcoal-400 uppercase tracking-wider">
                              Sources
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.references.map((ref, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 text-[11px] bg-cream-50 px-2 py-1 rounded-md text-charcoal-600">
                                  <span className="font-medium text-charcoal-700">{ref.guest_name}</span>
                                  <span className="text-charcoal-300">·</span>
                                  <span className="truncate max-w-[100px]">{ref.episode_title}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-cream-100 rounded-xl px-4 py-2.5 text-sm text-charcoal-500 animate-pulse">
                  Consulting the collective…
                </div>
              </div>
            )}
          </div>

          {/* Mic error */}
          {micError && (
            <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-red-50 text-xs text-red-600 text-center">
              {micError}
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-[#E5E5E2] bg-cream-50">
            {/* Recording state — full-width recording bar */}
            {isListening ? (
              <div className="space-y-2">
                {/* Transcript preview */}
                <div className="px-4 py-2.5 rounded-xl bg-cream-100 text-sm min-h-[40px] flex items-center">
                  {input ? (
                    <span className="text-charcoal-700 italic">{input}</span>
                  ) : (
                    <span className="text-charcoal-400 italic animate-pulse">Listening…</span>
                  )}
                </div>

                {/* Controls row: Cancel · Timer ring · Submit */}
                <div className="flex items-center justify-between">
                  {/* Cancel */}
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-charcoal-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>

                  {/* Recording indicator */}
                  <div className="flex items-center gap-2">
                    <div className="relative w-7 h-7">
                      <svg className="w-7 h-7" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="#E5E7EB" strokeWidth="2" />
                      </svg>
                      {/* Pulsing dot in center */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      </div>
                    </div>
                    <span className="text-xs font-mono text-charcoal-500 tabular-nums text-right">
                      {elapsed}s
                    </span>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleVoiceSubmit}
                    disabled={!input.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-40 transition-colors"
                  >
                    Send
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              /* Normal input state */
              <form onSubmit={handleSubmit} className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question…"
                  className="w-full px-4 py-2.5 pr-20 rounded-xl bg-cream-100 text-sm text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-2 focus:ring-accent-600/20 focus:bg-white transition-all"
                  disabled={isLoading}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {/* Mic button — only if supported */}
                  {micSupported && !isLoading && (
                    <button
                      type="button"
                      onClick={startListening}
                      className="p-1.5 text-charcoal-400 hover:text-accent-600 transition-colors rounded-lg hover:bg-accent-50"
                      title="Voice input (auto-stops on silence)"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="1" width="6" height="12" rx="3" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </button>
                  )}
                  {/* Send button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="p-1.5 text-charcoal-400 hover:text-accent-600 disabled:opacity-40 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </form>
            )}
            <p className="text-center text-[10px] text-charcoal-400 mt-1.5">
              Answers generated from podcast transcripts. Always verify.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
