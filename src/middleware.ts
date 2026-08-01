import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Common scraper / bot User-Agents to block at the edge
const KNOWN_BOT_UAS = [
  'scrapy',
  'python-requests',
  'python-urllib',
  'curl',
  'wget',
  'httpx',
  'sqlmap',
  'nikto',
  'zgrab',
  'nmap',
  'masscan',
  'gobuster',
  'dirbuster',
]

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase()

  // Edge bot / scraper blocking for non-static assets
  if (KNOWN_BOT_UAS.some((bot) => userAgent.includes(bot))) {
    return applySecurityHeaders(new NextResponse('Access Denied (Automated Client Detected)', { status: 403 }))
  }

  let supabaseResponse = NextResponse.next({ request })
  applySecurityHeaders(supabaseResponse)


  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedPrefixes = ['/admin', '/faculty', '/student']
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p))

  // 1. Not logged in → redirect UI routes to login
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Fetch role and status if logged in
  let role = user?.user_metadata?.role?.toLowerCase() ?? ''
  let status = 'Active'

  if (user && (isProtected || path === '/login' || path.startsWith('/api/'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()
    if (profile) {
      role = profile.role?.toLowerCase() ?? ''
      status = profile.status ?? 'Active'
    }
  }

  // If user is deactivated, clear session cookies and redirect to login
  if (user && status === 'Inactive') {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Account deactivated' }, { status: 403 })
    }
    const redirectResponse = NextResponse.redirect(new URL('/login?error=deactivated', request.url))
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
      }
    })
    return redirectResponse
  }

  // 2. Logged in → enforce role matches the route prefix for UI pages
  if (user && isProtected) {
    const targetSection = protectedPrefixes.find((p) => path.startsWith(p))?.slice(1)
    if (targetSection && role !== targetSection) {
      return NextResponse.redirect(new URL(`/${role || 'login'}`, request.url))
    }
  }

  // 3. Already logged in and trying to visit /login → redirect to their dashboard
  if (user && path === '/login' && role) {
    return NextResponse.redirect(new URL(`/${role}`, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/faculty/:path*', '/student/:path*', '/login', '/api/:path*'],
}

