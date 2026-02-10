import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rhzpjvuutpjtdsbnskdy.supabase.co'
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM'

export function createServerSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

