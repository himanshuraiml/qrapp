'use client'

import ErrorRecovery from '@/components/ErrorRecovery'

// Catches crashes in the root layout itself (rare — most errors are caught
// by error.tsx instead). Next.js requires this file to render its own
// <html>/<body> since it replaces the entire root layout when triggered.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <ErrorRecovery error={error} reset={reset} />
      </body>
    </html>
  )
}
