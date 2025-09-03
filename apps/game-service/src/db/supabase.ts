import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '../config'

let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const env = loadEnv()
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return cached
  }
  cached = createClient(url, key, {
    auth: { persistSession: false },
  })
  return cached
}
