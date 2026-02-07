'use client'

import { useEffect, useRef } from 'react'
import type { Expert } from '@/lib/types/panel'

interface ExpertMentionDropdownProps {
  experts: Expert[]
  position: { top: number; left: number }
  onSelect: (expert: Expert | null) => void // null means @Panel
  onClose: () => void
}

export default function ExpertMentionDropdown({
  experts,
  position,
  onSelect,
  onClose,
}: ExpertMentionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 bg-white border border-charcoal-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <button
        onClick={() => onSelect(null)}
        className="w-full text-left px-4 py-3 hover:bg-charcoal-50 transition-colors flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
          @
        </div>
        <div>
          <p className="font-semibold text-charcoal-900">@Panel</p>
          <p className="text-xs text-charcoal-500">Ask all experts</p>
        </div>
      </button>
      
      <div className="h-px bg-charcoal-200"></div>
      
      {experts.map((expert) => (
        <button
          key={expert.id}
          onClick={() => onSelect(expert)}
          className="w-full text-left px-4 py-3 hover:bg-charcoal-50 transition-colors flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {expert.avatar ? (
              <img 
                src={expert.avatar} 
                alt={expert.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              expert.name.split(' ').map(n => n[0]).join('')
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-charcoal-900 text-sm">{expert.name}</p>
            <p className="text-xs text-charcoal-500 truncate">
              {expert.title}{expert.company ? `, ${expert.company}` : ''}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

