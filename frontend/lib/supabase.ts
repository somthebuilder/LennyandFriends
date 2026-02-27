import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Some mobile/in-app browsers abort the auth lock unexpectedly.
// A no-op lock keeps auth initialization from failing on those clients.
const noOpLock = async (_name: string, _timeout: number, fn: () => Promise<unknown>) => fn()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: noOpLock,
  },
})

