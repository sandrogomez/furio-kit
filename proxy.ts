import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authAdapter } from '@/shared/auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/403']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const session = await authAdapter.validateRequest(request)

  if (!session) {
    const loginUrl = authAdapter.getLoginUrl(pathname)
    return NextResponse.redirect(new URL(loginUrl, request.url))
  }

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const response = NextResponse.next()
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
