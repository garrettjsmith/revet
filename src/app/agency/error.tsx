'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <h2 className="text-lg font-semibold text-ink mb-2">Something went wrong</h2>
      <p className="text-warm-gray text-sm mb-4">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-ink text-cream rounded-full text-sm">Try again</button>
    </div>
  )
}
