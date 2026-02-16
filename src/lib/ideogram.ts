import { createAdminClient } from '@/lib/supabase/admin'

const IDEOGRAM_API_URL = 'https://api.ideogram.ai/generate'

interface IdeogramResponse {
  data: Array<{
    url: string
    prompt: string
    is_image_safe: boolean
  }>
}

/**
 * Generate a Google Business Profile post image via Ideogram API.
 * Returns the public URL of the image stored in Supabase Storage.
 */
export async function generatePostImage({
  headline,
  subtext,
  designStyle,
  primaryColor,
  secondaryColor,
  fontStyle,
  businessType,
}: {
  headline: string
  subtext: string
  designStyle: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontStyle: string | null
  businessType: string
}): Promise<string> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) {
    throw new Error('IDEOGRAM_API_KEY not configured')
  }

  const prompt = buildImagePrompt({
    headline,
    subtext,
    designStyle,
    primaryColor,
    secondaryColor,
    fontStyle,
    businessType,
  })

  const response = await fetch(IDEOGRAM_API_URL, {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        aspect_ratio: 'ASPECT_4_3',
        model: 'V_2',
        magic_prompt_option: 'OFF',
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Ideogram API error ${response.status}: ${text}`)
  }

  const result: IdeogramResponse = await response.json()
  const imageUrl = result.data?.[0]?.url

  if (!imageUrl) {
    throw new Error('No image returned from Ideogram')
  }

  // Download image and upload to Supabase Storage
  const storedUrl = await uploadToStorage(imageUrl)
  return storedUrl
}

/**
 * Build an Ideogram prompt from brand config + post content.
 */
function buildImagePrompt({
  headline,
  subtext,
  designStyle,
  primaryColor,
  secondaryColor,
  fontStyle,
  businessType,
}: {
  headline: string
  subtext: string
  designStyle: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontStyle: string | null
  businessType: string
}): string {
  // Derive a short headline (max ~4 words, all caps) from the topic
  const displayHeadline = headline.toUpperCase()

  const color = primaryColor || '#1A1A1A'
  const colorSecondary = secondaryColor || '#333333'
  const font = fontStyle || 'heavy sans-serif font'

  // Two style variants — pick based on whether we have a design style hint
  const hasPhotoStyle = designStyle?.toLowerCase().includes('photo') ||
    designStyle?.toLowerCase().includes('background')

  if (hasPhotoStyle) {
    return `A professional Google Business Profile post image, 4:3 aspect ratio. Background shows a subtle out-of-focus image related to ${businessType}, overlaid with a strong ${color} color wash at 75% opacity creating a tinted effect. Large bold white text perfectly centered reading "${displayHeadline}" in a ${font}. Text has subtle drop shadow for legibility. Below, smaller white text "${subtext}". The photo is atmospheric and blurred, serving only as texture beneath the color overlay. Text is the hero. Premium, aspirational design.${designStyle ? ` Style notes: ${designStyle}` : ''}`
  }

  return `A professional Google Business Profile post image, 4:3 aspect ratio. Solid deep gradient background transitioning from ${color} at top-left to ${colorSecondary} at bottom-right. Large bold white text perfectly centered reading "${displayHeadline}" in a ${font}. Text is ALL CAPS, bold, and takes up 60% of image width. Below the headline, smaller white text reading "${subtext}". No decorative elements, no borders, no logos, no icons, no photographs, no people. Just bold text on clean gradient. Minimal corporate design. High contrast. Easy to read at thumbnail size.${designStyle ? ` Style notes: ${designStyle}` : ''}`
}

const STORAGE_BUCKET = 'assets'

/**
 * Download an image from a URL and upload it to Supabase Storage.
 * Returns the public URL.
 */
async function uploadToStorage(imageUrl: string): Promise<string> {
  const supabase = createAdminClient()

  // Ensure the bucket exists
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.find((b) => b.name === STORAGE_BUCKET)) {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: true })
  }

  // Download the image
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`)
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  const fileName = `post-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, imageBuffer, {
      contentType: 'image/png',
      cacheControl: '31536000',
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName)

  return publicUrl
}
