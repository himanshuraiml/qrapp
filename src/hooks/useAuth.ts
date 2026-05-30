'use client'

import { useAuthContext } from '@/components/AuthProvider'

// useAuth now reads the session/profile handed off by the server via
// <AuthProvider> (see src/app/{admin,faculty,student}/layout.tsx). This
// eliminates the old client-side INITIAL_SESSION / /api/auth/me race that
// caused data to disappear on refresh.
export function useAuth() {
  return useAuthContext()
}
