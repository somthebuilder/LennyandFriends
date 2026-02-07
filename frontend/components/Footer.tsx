'use client'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-white via-charcoal-50 to-orange-50/30 border-t border-charcoal-200/50 mt-auto w-full">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <div className="flex flex-col gap-6">
          {/* Attribution Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-center gap-2 text-center">
            <p className="text-sm text-charcoal-600">
              Built with 🤖 by <a href="https://www.linkedin.com/in/shivanshusom/" target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 hover:text-orange-700 transition-colors underline">Shivanshu Singh Som</a>
            </p>
            <span className="hidden md:inline text-charcoal-400">•</span>
            <p className="text-sm text-charcoal-600">
              All podcast content © <a href="https://www.lennysnewsletter.com/podcast" target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 hover:text-orange-700 transition-colors">Lenny Rachitsky</a> & respective guests
            </p>
          </div>
          
          {/* Disclaimer */}
          <div className="text-center">
            <p className="text-xs text-charcoal-500 max-w-3xl mx-auto leading-relaxed">
              This is an independent, experimental project. Not affiliated with or endorsed by Lenny Rachitsky or Lenny's Newsletter. 
              All content is sourced from publicly available <a href="https://www.lennysnewsletter.com/podcast" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 underline">Lenny's Podcast</a> transcripts.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

