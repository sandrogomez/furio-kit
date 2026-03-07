import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { authAdapter } from '@/shared/auth'

/**
 * Middleware runs on the Edge runtime before every matched request.
 * It validates the session and redirects unauthenticated users to /login.
 *
 * Add protected path patterns to the `matcher` config below.
 */
export async function proxy(request: NextRequest) {
  const session = await authAdapter.validateRequest(request)

  if (!session) {
    const loginUrl = authAdapter.getLoginUrl(request.nextUrl.pathname)
    return NextResponse.redirect(new URL(loginUrl, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/settings/:path*',
    // Add more protected routes here
  ],
}
