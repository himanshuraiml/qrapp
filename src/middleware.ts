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

  // 2. Logged in → enforce role matches the route prefix
  if (user && isProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role?.toLowerCase() ?? ''

    // Determine which top-level section the request targets
    const targetSection = protectedPrefixes.find((p) => path.startsWith(p))?.slice(1) // e.g. "faculty"

    if (targetSection && role !== targetSection) {
      // Redirect to the user's own dashboard — don't expose a 403
      return NextResponse.redirect(new URL(`/${role || 'login'}`, request.url))
    }
  }

  // 3. Already logged in and trying to visit /login → redirect to their dashboard
  if (user && path === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role) {
      return NextResponse.redirect(
        new URL(`/${profile.role.toLowerCase()}`, request.url)
      )
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/faculty/:path*', '/student/:path*', '/login'],
}
