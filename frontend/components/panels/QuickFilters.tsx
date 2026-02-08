'use client'

import type { QuickFilter, AgreementLevel, Discussion } from '@/lib/types/panel'

interface QuickFiltersProps {
  activeFilter: QuickFilter
  onFilterChange: (filter: QuickFilter) => void
  discussions: Discussion[]
}

export default function QuickFilters({
  activeFilter,
  onFilterChange,
  discussions,
}: QuickFiltersProps) {
  const getFilterCount = (filter: QuickFilter): number => {
    if (filter === 'all') return discussions.length
    
    if (filter === 'disagreements') {
      return discussions.filter(d => 
        d.agreementLevel === 'moderate_disagreement' || 
        d.agreementLevel === 'strong_disagreement'
      ).length
    }
    
    if (filter === 'consensus') {
      return discussions.filter(d => d.agreementLevel === 'consensus').length
    }
    
    if (filter === 'actionable') {
      return discussions.filter(d => 
        d.keyTakeaways.some(t => t.type === 'actionable')
      ).length
    }
    
    return 0
  }

  const filters: Array<{ value: QuickFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'disagreements', label: 'Disagreements' },
    { value: 'consensus', label: 'Consensus' },
    { value: 'actionable', label: 'Actionable' },
  ]

  return (
    <div className="mb-6">
      <label className="text-sm font-semibold text-charcoal-700 mb-3 block">
        Quick Filter:
      </label>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const count = getFilterCount(filter.value)
          const isActive = activeFilter === filter.value
          
          return (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-400 ${
                isActive
                  ? 'bg-orange-600 text-white'
                  : 'bg-white border border-charcoal-300 text-charcoal-700 hover:border-charcoal-400'
              }`}
            >
              {filter.label}
              {isActive && count > 0 && ` (${count})`}
            </button>
          )
        })}
      </div>
    </div>
  )
}

