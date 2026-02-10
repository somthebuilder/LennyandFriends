/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Only rewrite in development - in production, use NEXT_PUBLIC_API_URL directly
    // Exclude panels routes - they are handled by Next.js API routes
    if (process.env.NODE_ENV === 'development') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      return [
        {
          source: '/api/query/:path*',
          destination: `${apiUrl}/query/:path*`,
        },
        {
          source: '/api/split-chat/:path*',
          destination: `${apiUrl}/split-chat/:path*`,
        },
        {
          source: '/api/validate-user-input/:path*',
          destination: `${apiUrl}/validate-user-input/:path*`,
        },
        {
          source: '/api/podcast-request/:path*',
          destination: `${apiUrl}/podcast-request/:path*`,
        },
        {
          source: '/api/podcast-vote/:path*',
          destination: `${apiUrl}/podcast-vote/:path*`,
        },
        {
          source: '/api/podcasts/:path*',
          destination: `${apiUrl}/podcasts/:path*`,
        },
        {
          source: '/api/user-votes/:path*',
          destination: `${apiUrl}/user-votes/:path*`,
        },
        // Panels routes are handled by Next.js API routes, not rewritten
      ]
    }
    return []
  },
}

module.exports = nextConfig

