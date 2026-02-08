import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the backend API URL
 * In development, uses Next.js rewrites (localhost:8000)
 * In production, uses NEXT_PUBLIC_API_URL environment variable
 */
export function getApiUrl(): string {
  // In production, use the environment variable
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  
  // In development, Next.js rewrites handle /api/* to localhost:8000
  // So we can use relative URLs
  if (typeof window !== 'undefined') {
    return '' // Empty string means relative URL, Next.js will rewrite it
  }
  
  // Server-side: use environment variable or default
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}

