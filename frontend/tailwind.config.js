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
        'display': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Editorial magazine theme
        cream: {
          50: '#FDFCFB', // Softer cream
          100: '#FCFBFA', // Main background
          200: '#FAF9F7',
          300: '#F7F6F4',
        },
        charcoal: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937', // Deeper charcoal text
          900: '#111827',
        },
        orange: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C', // Muted warm orange
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        // Rick and Morty 8-bit theme
        rick: {
          50: '#e0f7ff',
          100: '#b3e5ff',
          200: '#80d4ff',
          300: '#4dc2ff',
          400: '#26b5ff',
          500: '#00a8ff', // Rick's blue
          600: '#0099e6',
          700: '#0088cc',
          800: '#0077b3',
          900: '#005999',
        },
        portal: {
          50: '#f3e5f5',
          100: '#e1bee7',
          200: '#ce93d8',
          300: '#ba68c8',
          400: '#ab47bc',
          500: '#9d4edd', // Portal purple
          600: '#8e24aa',
          700: '#7b1fa2',
          800: '#6a1b9a',
          900: '#4a148c',
        },
        morty: {
          50: '#fff9e6',
          100: '#fff0b3',
          200: '#ffe680',
          300: '#ffdd4d',
          400: '#ffd700', // Morty's yellow
          500: '#ffc107',
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00',
        },
        toxic: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          300: '#81c784',
          400: '#66bb6a',
          500: '#00ff00', // Toxic green (portal green)
          600: '#43a047',
          700: '#388e3c',
          800: '#2e7d32',
          900: '#1b5e20',
        },
        space: {
          50: '#e3f2fd',
          100: '#bbdefb',
          200: '#90caf9',
          300: '#64b5f6',
          400: '#42a5f5',
          500: '#1e88e5', // Space blue
          600: '#1976d2',
          700: '#1565c0',
          800: '#0d47a1',
          900: '#0a1929',
        },
        // Backward compatibility
        teal: {
          500: '#00ff00',
          400: '#66bb6a',
          300: '#81c784',
          200: '#a5d6a7',
        },
        peach: {
          500: '#ffd700',
          400: '#ffdd4d',
          300: '#ffe680',
        },
        navy: {
          900: '#0a1929',
          800: '#0d47a1',
          700: '#1565c0',
          500: '#1e88e5',
          800: '#0a1929',
        },
        purple: {
          500: '#9d4edd',
          400: '#ab47bc',
          300: '#ba68c8',
        },
        fire: {
          500: '#00ff00',
          400: '#66bb6a',
          300: '#81c784',
        },
        flame: {
          500: '#ffd700',
          400: '#ffdd4d',
          300: '#ffe680',
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'gradient-x': 'gradient-x 3s ease infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
