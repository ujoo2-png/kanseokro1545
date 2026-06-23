const SUPABASE_CONFIG = {
  url: 'https://jkcaaebgnqmytfvzjhks.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprY2FhZWJnbnFteXRmdnpqaGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDAwOTUsImV4cCI6MjA5NzYxNjA5NX0.dDODoT7vNj1opDgUGHO69sh6FJJ9E7NjF6F68o2EfMU',
}

let supabaseClient = null

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.warn('Supabase: @supabase/supabase-js CDN이 로드되지 않았습니다.')
    return null
  }
  supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  return supabaseClient
}

function getSupabase() {
  if (!supabaseClient) return initSupabase()
  return supabaseClient
}
