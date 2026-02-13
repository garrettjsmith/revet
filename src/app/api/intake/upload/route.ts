import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime']

/**
 * POST /api/intake/upload
 *
 * Upload a file (logo, photo, video) to Supabase Storage.
 * Public endpoint (used by intake form).
 * Returns the public URL.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const folder = (formData.get('folder') as string) || 'intake'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${randomUUID()}.${ext}`

  const adminClient = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await adminClient.storage
    .from('assets')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    console.error('[intake/upload] Storage error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: urlData } = adminClient.storage
    .from('assets')
    .getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl, path })
}
