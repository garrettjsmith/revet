'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h2 className="text-lg font-serif text-ink mb-2">Something went wrong</h2>
      <p className="text-sm text-warm-gray mb-6 max-w-md text-center">
        {error.message || 'An unexpected error occurred loading this page.'}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
