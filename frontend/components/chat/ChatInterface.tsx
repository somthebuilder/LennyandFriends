'use client'

import { useState } from 'react'
import { sendMessage, ChatMessage } from '@/lib/api/chat'

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendMessage(input, 'lennys-podcast')
      setMessages(prev => [...prev, response])
    } catch (error) {
      console.error('Failed to send message:', error)
      // TODO: Handle error state
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-white border border-charcoal-200 rounded-xl shadow-sm flex flex-col h-[600px] lg:h-auto">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 p-8 opacity-60">
            <div className="w-12 h-12 bg-charcoal-100 rounded-full flex items-center justify-center text-2xl">
              ✨
            </div>
            <p className="text-charcoal-600 font-serif italic text-lg">
              "What are the best books for product managers?"
            </p>
            <p className="text-charcoal-600 font-serif italic text-lg">
              "Where do guests disagree on prioritization?"
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-charcoal-900 text-white rounded-2xl rounded-tr-sm px-4 py-3' : 'w-full'}`}>
                {msg.role === 'user' ? (
                  <p className="font-sans">{msg.content}</p>
                ) : (
                  <div className="space-y-4">
                    {/* Answer */}
                    <div className="prose-editorial text-sm">
                      <p>{msg.content}</p>
                    </div>
                    
                    {/* References */}
                    {msg.references && (
                      <div className="bg-cream-50 rounded-lg p-3 border border-charcoal-100 space-y-2">
                        <div className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                          Sources
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.references.map((ref, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-xs bg-white border border-charcoal-200 px-2 py-1.5 rounded-md text-charcoal-700">
                              <span className="font-medium">{ref.guest_name}</span>
                              <span className="text-charcoal-300">|</span>
                              <span className="truncate max-w-[150px]">{ref.episode_title}</span>
                            </div>
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
          <div className="flex justify-start animate-pulse">
            <div className="bg-charcoal-50 rounded-lg px-4 py-3 text-sm text-charcoal-400">
              Consulting the collective...
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-charcoal-100 bg-white rounded-b-xl">
        <form onSubmit={handleSubmit} className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..." 
            className="input-editorial pr-12 shadow-sm"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-charcoal-400 hover:text-accent-600 disabled:opacity-50 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
        <div className="text-center mt-2">
          <p className="text-[10px] text-charcoal-400">
            Answers generated from podcast transcripts. Always verify important details.
          </p>
        </div>
      </div>
    </div>
  )
}

