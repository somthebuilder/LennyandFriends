'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Footer from '@/components/Footer'
import type { User } from '@supabase/supabase-js'

interface Panel {
  id: string
  slug?: string
  name: string
  description: string
  category: string
  insightfulCount: number
  guests: Array<{ name: string; avatar?: string }>
}

const CATEGORIES = [
  'All Panels',
  'Early Stage Growth',
  'Hiring & Building Teams',
  'Pricing Strategy',
  'Scaling Product Teams',
  'Building Culture',
  'B2B Product',
  'Fundraising',
]

export default function ExplorePanelsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [activeCategory, setActiveCategory] = useState('All Panels')
  const [activeFilter, setActiveFilter] = useState<'Most Viewed' | 'Most Valuable'>('Most Viewed')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCustomPanelModal, setShowCustomPanelModal] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [panels, setPanels] = useState<Panel[]>([])
  const [isLoadingPanels, setIsLoadingPanels] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch panels from API
  useEffect(() => {
    const fetchPanels = async () => {
      try {
        setIsLoadingPanels(true)
        const response = await fetch('/api/panels')
        if (response.ok) {
          const data = await response.json()
          setPanels(data)
        } else {
          console.error('Failed to fetch panels:', response.statusText)
          setPanels([])
        }
      } catch (error) {
        console.error('Error fetching panels:', error)
        setPanels([])
      } finally {
        setIsLoadingPanels(false)
      }
    }

    fetchPanels()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showCategoryDropdown && !target.closest('.category-dropdown')) {
        setShowCategoryDropdown(false)
      }
    }

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCategoryDropdown])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleCreateCustomPanel = () => {
    if (!user) {
      router.push('/')
      return
    }
    setShowCustomPanelModal(true)
  }

  // Filter panels by category and search query
  // Search includes: panel names, descriptions, expert/guest names, and categories
  const filteredPanels = (activeCategory === 'All Panels'
    ? panels
    : panels.filter(p => p.category === activeCategory)
  ).filter(panel => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    // Search in panel name, description, category, and expert/guest names
    return (
      panel.name.toLowerCase().includes(query) ||
      panel.description.toLowerCase().includes(query) ||
      panel.category.toLowerCase().includes(query) ||
      panel.guests.some(guest => guest.name.toLowerCase().includes(query))
    )
  })

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex flex-col">
      {/* Header - Same as Landing Page */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-charcoal-200/50 shadow-sm transition-all duration-300">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-6 md:px-12 py-4">
            <div className="flex justify-between items-center">
              {/* Logo/Brand with Breadcrumbs */}
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center gap-3 group"
                >
                  <img 
                    src="/panelchat-logo.svg" 
                    alt="Panel Chat"
                    className="h-8 md:h-10 w-auto transition-transform group-hover:scale-[1.02] duration-500"
                  />
                </button>
                <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={() => router.push('/lennys-podcast/panels')}
                  className="text-charcoal-600 hover:text-orange-600 transition-colors font-medium"
                >
                  Lenny's Podcast
                </button>
                <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-semibold text-charcoal-800">Panels</span>
              </div>
              
              {/* Right Side Navigation */}
              <div className="flex items-center gap-6">
                {/* Auth Section */}
                {user ? (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-charcoal-600 hidden sm:inline font-medium">
                      {user.email}
                    </span>
                    <button
                      onClick={handleSignOut}
                      className="text-sm font-medium text-charcoal-700 hover:text-orange-600 transition-colors duration-200"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push('/')}
                    className="text-sm font-medium text-charcoal-700 hover:text-orange-600 transition-colors duration-200"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 w-full">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-16">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Sidebar - Categories (Desktop Only) */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="lg:sticky lg:top-24 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-charcoal-500 uppercase tracking-wider mb-4">
                    Categories
                  </h3>
                  <nav className="space-y-1">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category}
                        onClick={() => setActiveCategory(category)}
                        className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          activeCategory === category
                            ? 'bg-orange-100 text-orange-700'
                            : 'text-charcoal-700 hover:bg-charcoal-50'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 space-y-8">
              {/* Header Section */}
              <div>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-display font-black text-charcoal-900 mb-3">
                      Explore Curated Panels
                    </h1>
                    <p className="text-lg text-charcoal-600">
                      Ask questions and get insights from expert panels
                    </p>
                  </div>
                  
                  {/* Create Custom Panel Button */}
                  {user && (
                    <button
                      onClick={handleCreateCustomPanel}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/50 hover:-translate-y-0.5 transition-all duration-500"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Custom Panel
                    </button>
                  )}
                </div>

                {/* Mobile: Search in Row 1, Categories and Filters in Row 2 */}
                <div className="lg:hidden space-y-3 mb-6">
                  {/* Row 1: Search Box */}
                  <div className="relative w-full">
                    <input
                      type="text"
                      placeholder="Search panels and experts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-3 pl-11 text-sm bg-white border border-charcoal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 placeholder:text-charcoal-400"
                    />
                    <svg 
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* Row 2: Categories Dropdown and Filter Buttons */}
                  <div className="flex gap-2">
                    {/* Categories Dropdown */}
                    <div className="relative category-dropdown flex-1">
                      <button
                        onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-charcoal-300 rounded-lg text-sm font-semibold text-charcoal-700 hover:bg-charcoal-50 transition-all duration-200"
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <span className="truncate">{activeCategory}</span>
                        </span>
                        <svg 
                          className={`w-4 h-4 ml-1 flex-shrink-0 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {/* Dropdown Menu */}
                      {showCategoryDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-charcoal-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                          <nav className="p-2">
                            {CATEGORIES.map((category) => (
                              <button
                                key={category}
                                onClick={() => {
                                  setActiveCategory(category)
                                  setShowCategoryDropdown(false)
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  activeCategory === category
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'text-charcoal-700 hover:bg-charcoal-50'
                                }`}
                              >
                                {category}
                              </button>
                            ))}
                          </nav>
                        </div>
                      )}
                    </div>

                    {/* Filter Buttons */}
                    {(['Most Viewed', 'Most Valuable'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                          activeFilter === filter
                            ? 'bg-charcoal-900 text-white'
                            : 'bg-white border border-charcoal-300 text-charcoal-700 hover:border-charcoal-400'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Desktop: Search and Filters (without categories) */}
                <div className="hidden lg:flex flex-col sm:flex-row gap-4">
                  {/* Search Box */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Search panels and experts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-3 pl-11 text-sm bg-white border border-charcoal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 placeholder:text-charcoal-400"
                    />
                    <svg 
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* Filter Buttons */}
                  <div className="flex gap-3">
                    {(['Most Viewed', 'Most Valuable'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                          activeFilter === filter
                            ? 'bg-charcoal-900 text-white'
                            : 'bg-white border border-charcoal-300 text-charcoal-700 hover:border-charcoal-400'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Panels Grid */}
              {isLoadingPanels ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-orange-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-orange-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-sm text-charcoal-500 font-medium">Loading panels...</p>
                </div>
              ) : filteredPanels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <p className="text-center text-charcoal-600 font-medium">No panels found</p>
                  <p className="text-center text-charcoal-500 text-sm">Check back later or create your own panel!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredPanels.map((panel, index) => (
                  <div
                    key={panel.id}
                    style={{ animationDelay: `${index * 100}ms` }}
                    className="editorial-card p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-500 cursor-pointer animate-fade-in-up bg-white border border-charcoal-100"
                    onClick={() => router.push(`/lennys-podcast/panels/${panel.slug || panel.id}`)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-charcoal-900 mb-2">
                          {panel.name}
                        </h3>
                        <p className="text-sm text-charcoal-600 leading-relaxed mb-4">
                          {panel.description}
                        </p>
                      </div>
                    </div>

                    {/* Guests */}
                    <div className="flex items-center gap-2 mb-4">
                      {panel.guests.map((guest, i) => (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center text-white text-xs font-bold shadow-md"
                          title={guest.name}
                        >
                          {guest.name.split(' ').map(n => n[0]).join('')}
                        </div>
                      ))}
                      {panel.guests.length > 3 && (
                        <span className="text-xs text-charcoal-500 font-medium ml-1">
                          +{panel.guests.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Valuable Count */}
                    <div className="flex items-center gap-2 pt-4 border-t border-charcoal-100">
                      <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-sm font-semibold text-charcoal-700">
                        {panel.insightfulCount.toLocaleString()} people found this valuable
                      </span>
                    </div>
                  </div>
                  ))}
                </div>
              )}

              {/* View More */}
              <div className="mt-8 text-center">
                <button className="px-8 py-3 text-sm font-semibold text-charcoal-700 border-2 border-charcoal-300 rounded-xl hover:bg-charcoal-50 hover:border-charcoal-400 transition-all duration-200">
                  View More Panels
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

