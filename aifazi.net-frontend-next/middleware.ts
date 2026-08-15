import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  const response = NextResponse.next()

  // Forward cookies to backend for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      // Forward the cookie header to the backend via the rewrite
      requestHeaders.set('cookie', cookieHeader)
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/api/:path*'],
}