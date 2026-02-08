'use client'

import type { PanelTab } from '@/lib/types/panel'

interface PanelTabsProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
}

export default function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="flex gap-8 border-b border-charcoal-200 mb-8">
      <button
        onClick={() => onTabChange('discussion')}
        className={`pb-4 px-1 font-semibold text-base transition-colors duration-400 relative ${
          activeTab === 'discussion'
            ? 'text-charcoal-900'
            : 'text-charcoal-500 hover:text-charcoal-700'
        }`}
      >
        The Discussion
        {activeTab === 'discussion' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></span>
        )}
      </button>
      <button
        onClick={() => onTabChange('ask')}
        className={`pb-4 px-1 font-semibold text-base transition-colors duration-400 relative ${
          activeTab === 'ask'
            ? 'text-charcoal-900'
            : 'text-charcoal-500 hover:text-charcoal-700'
        }`}
      >
        Ask the Panel
        {activeTab === 'ask' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></span>
        )}
      </button>
    </div>
  )
}

