import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
  const path = request.nextUrl.pathname

  const protectedPrefixes = ['/admin', '/faculty', '/student']
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p))

  // 1. Not logged in → redirect to login
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Fetch role and status if logged in
  let role = user?.user_metadata?.role?.toLowerCase() ?? ''
  let status = 'Active'

  if (user && (isProtected || path === '/login')) {
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
    const redirectResponse = NextResponse.redirect(new URL('/login?error=deactivated', request.url))
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
      }
    })
    return redirectResponse
  }

  // 2. Logged in → enforce role matches the route prefix
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
  matcher: ['/admin/:path*', '/faculty/:path*', '/student/:path*', '/login'],
}
