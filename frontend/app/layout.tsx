import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import BuyMeACoffeeFloater from '@/components/BuyMeACoffeeFloater'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'espresso — Collective wisdom from the world\'s best operators',
  description: 'Explore synthesized knowledge, concepts, and insights from top podcasts and thought leaders.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <BuyMeACoffeeFloater />
      </body>
    </html>
  )
}
