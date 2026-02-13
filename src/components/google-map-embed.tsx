'use client'

export function GoogleMapEmbed({
  title,
  latitude,
  longitude,
}: {
  title: string
  latitude: number
  longitude: number
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  return (
    <iframe
      title={title}
      width="100%"
      height="300"
      style={{ border: 0 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${latitude},${longitude}&zoom=15`}
    />
  )
}
