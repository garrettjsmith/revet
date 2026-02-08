import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string // if omitted, rendered as plain text (current page)
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <div key={index} className="flex items-center gap-1.5">
            {item.href ? (
              <Link
                href={item.href}
                className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-xs text-warm-gray">{item.label}</span>
            )}
            {!isLast && <span className="text-xs text-warm-border">/</span>}
          </div>
        )
      })}
    </div>
  )
}
