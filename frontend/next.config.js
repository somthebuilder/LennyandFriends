/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Only rewrite in development - in production, use NEXT_PUBLIC_API_URL directly
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: process.env.NEXT_PUBLIC_API_URL 
            ? `${process.env.NEXT_PUBLIC_API_URL}/:path*`
            : 'http://localhost:8000/:path*',
        },
      ]
    }
    return []
  },
}

module.exports = nextConfig

