/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        'serif': ['Source Serif 4', 'Georgia', 'serif'],
        'display': ['Source Serif 4', 'Georgia', 'serif'],
        'cafe': ['Playfair Display', 'Georgia', 'serif'],
      },
      colors: {
        // Espresso Editorial Palette (Neutral & Quiet)
        // Primary background & text
        cream: {
          50: '#FDFCFB', // Base background
          100: '#FAF9F7',
          200: '#F5F4F1',
          300: '#EBE9E4',
        },
        charcoal: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280', // Muted text
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937', // Body text
          900: '#111827', // Headings
        },
        // Lenny's Podcast Accent (Muted Orange)
        accent: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C', // Primary CTA / Links
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        // 20VC Podcast Accent (Muted Blue)
        'podcast-blue': {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // All-In Podcast Accent (Muted Emerald)
        'podcast-emerald': {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        // Espresso Brown (brand color for coming-soon / neutral accent)
        espresso: {
          50: '#FAF5F0',
          100: '#F3EAE0',
          200: '#E6D5C1',
          300: '#D4B896',
          400: '#C19A6B',
          500: '#A0764A',
          600: '#7B5B39', // Primary espresso brown
          700: '#5C4329',
          800: '#3D2D1C',
          900: '#2A1F14',
        },
        // Semantic utility colors (Muted)
        success: {
          DEFAULT: '#166534',
          bg: '#F0FDF4',
        },
        warning: {
          DEFAULT: '#92400E',
          bg: '#FEFCE8',
        },
        error: {
          DEFAULT: '#991B1B',
          bg: '#FEF2F2',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'steam-1': 'steamRise 3s ease-out infinite',
        'steam-2': 'steamRise 3.5s ease-out 0.8s infinite',
        'steam-3': 'steamRise 2.8s ease-out 1.6s infinite',
        'hero-enter': 'heroEnter 1s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'hero-enter-delay': 'heroEnter 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards',
        'hero-enter-delay-2': 'heroEnter 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards',
        'rule-expand': 'ruleExpand 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards',
        'section-enter': 'sectionEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'section-enter-d1': 'sectionEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards',
        'section-enter-d2': 'sectionEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        steamRise: {
          '0%': { opacity: '0', transform: 'translateY(0) scaleX(1)' },
          '15%': { opacity: '0.6' },
          '50%': { opacity: '0.3', transform: 'translateY(-20px) scaleX(1.2)' },
          '100%': { opacity: '0', transform: 'translateY(-40px) scaleX(0.8)' },
        },
        heroEnter: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        ruleExpand: {
          '0%': { width: '0%', opacity: '0' },
          '100%': { width: '100%', opacity: '1' },
        },
        sectionEnter: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
