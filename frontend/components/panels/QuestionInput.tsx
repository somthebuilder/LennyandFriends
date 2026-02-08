'use client'

import { useState, useRef, useEffect } from 'react'
import ExpertMentionDropdown from './ExpertMentionDropdown'
import type { Expert } from '@/lib/types/panel'

interface Mention {
  expertId: string | null // null means @Panel
  expertName: string
  startIndex: number
  endIndex: number
}

interface QuestionInputProps {
  value: string
  onChange: (value: string, mentions: Mention[]) => void
  onSubmit: () => void
  placeholder?: string
  experts: Expert[]
  disabled?: boolean
}

export default function QuestionInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask your question... Use @ to mention specific experts",
  experts,
  disabled = false,
}: QuestionInputProps) {
  const [mentions, setMentions] = useState<Mention[]>([])
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 })
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const MAX_CHARS = 500

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    // Check if user typed @
    if (newValue[cursorPos - 1] === '@' && newValue.length > value.length) {
      setMentionStartIndex(cursorPos - 1)
      const rect = e.target.getBoundingClientRect()
      const textarea = e.target
      const scrollTop = textarea.scrollTop
      
      // Calculate position for dropdown
      const textBeforeCursor = newValue.substring(0, cursorPos)
      const lines = textBeforeCursor.split('\n')
      const lineNumber = lines.length - 1
      const lineHeight = 24 // Approximate line height
      
      setMentionPosition({
        top: rect.top + (lineNumber * lineHeight) + lineHeight + scrollTop + 4,
        left: rect.left + 16,
      })
      setShowMentionDropdown(true)
    } else if (showMentionDropdown) {
      // Check if user typed space or other character after @
      const charAfterAt = newValue[cursorPos]
      if (charAfterAt === ' ' || charAfterAt === '\n' || cursorPos === newValue.length) {
        setShowMentionDropdown(false)
        setMentionStartIndex(null)
      }
    }

    // Update mentions based on text
    const newMentions = extractMentions(newValue)
    setMentions(newMentions)
    onChange(newValue, newMentions)
  }

  const extractMentions = (text: string): Mention[] => {
    const mentionRegex = /@(\w+)/g
    const found: Mention[] = []
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionText = match[1]
      const expert = experts.find(e => 
        e.name.toLowerCase().split(' ')[0].toLowerCase() === mentionText.toLowerCase() ||
        e.name.toLowerCase().replace(/\s+/g, '').includes(mentionText.toLowerCase())
      )

      if (mentionText.toLowerCase() === 'panel') {
        found.push({
          expertId: null,
          expertName: 'Panel',
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      } else if (expert) {
        found.push({
          expertId: expert.id,
          expertName: expert.name,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      }
    }

    return found
  }

  const handleMentionSelect = (expert: Expert | null) => {
    if (mentionStartIndex === null || !textareaRef.current) return

    const textarea = textareaRef.current
    const textBefore = value.substring(0, mentionStartIndex)
    const textAfter = value.substring(textarea.selectionStart)
    const mentionText = expert ? `@${expert.name.split(' ')[0]}` : '@Panel'
    const newValue = textBefore + mentionText + ' ' + textAfter

    setShowMentionDropdown(false)
    setMentionStartIndex(null)
    
    const newMentions = extractMentions(newValue)
    setMentions(newMentions)
    onChange(newValue, newMentions)

    // Focus back on textarea and set cursor position
    setTimeout(() => {
      textarea.focus()
      const newCursorPos = mentionStartIndex + mentionText.length + 1
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!disabled && value.trim()) {
        onSubmit()
      }
    }
  }

  const renderTextWithMentions = () => {
    // This is for display purposes - in a real implementation, you might want
    // to use a contentEditable div or a more sophisticated approach
    return value
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={MAX_CHARS}
        rows={4}
        className="editorial-textarea w-full"
      />
      
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-charcoal-500">
          {value.length}/{MAX_CHARS} characters
        </div>
        <button
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all duration-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send to Panel →
        </button>
      </div>

      {showMentionDropdown && (
        <ExpertMentionDropdown
          experts={experts}
          position={mentionPosition}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionDropdown(false)
            setMentionStartIndex(null)
          }}
        />
      )}
    </div>
  )
}

