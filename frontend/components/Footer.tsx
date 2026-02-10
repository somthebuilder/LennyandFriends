'use client'


export default function Footer() {
  return (
    <footer className="bg-cream-50 mt-auto w-full">
      {/* Top decorative rule — mirrors the hero dateline style */}
      <div className="flex items-center justify-center gap-4 px-6">
        <div className="h-px flex-1 max-w-xs bg-gradient-to-r from-transparent to-espresso-200/60" />
        <div className="w-1.5 h-1.5 rounded-full bg-espresso-300/40" />
        <div className="h-px flex-1 max-w-xs bg-gradient-to-l from-transparent to-espresso-200/60" />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-6 items-center text-center">
          {/* Attribution — editorial serif for names */}
          <div className="flex flex-col md:flex-row md:items-center justify-center gap-2">
            <p className="text-sm text-charcoal-500">
              Built with care by{' '}
              <a
                href="https://www.linkedin.com/in/shivanshusom/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-serif font-semibold italic text-espresso-600 hover:text-espresso-700 transition-colors"
              >
                Shivanshu Singh Som
              </a>
            </p>
            <span className="hidden md:inline text-espresso-300">·</span>
            <p className="text-sm text-charcoal-500">
              All podcast content ©{' '}
              <a
                href="https://www.lennysnewsletter.com/podcast"
                target="_blank"
                rel="noopener noreferrer"
                className="font-serif font-semibold italic text-espresso-600 hover:text-espresso-700 transition-colors"
              >
                Lenny Rachitsky
              </a>{' '}
              &amp; respective guests
            </p>
          </div>

          {/* Disclaimer — subtle, warm tones */}
          <p className="text-[11px] text-charcoal-400 max-w-lg mx-auto leading-relaxed">
            An independent, experimental project — not affiliated with or endorsed by Lenny Rachitsky or Lenny&apos;s Newsletter.
            Content sourced from publicly available{' '}
            <a
              href="https://www.lennysnewsletter.com/podcast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-espresso-400 hover:text-espresso-500 transition-colors underline underline-offset-2 decoration-espresso-200"
            >
              Lenny&apos;s Podcast
            </a>{' '}
            transcripts.
          </p>

          {/* Bottom colophon — tiny, editorial */}
          <p className="text-[9px] font-sans uppercase tracking-[0.3em] text-espresso-300 select-none">
            espresso · 2026
          </p>
        </div>
      </div>
    </footer>
  )
}
