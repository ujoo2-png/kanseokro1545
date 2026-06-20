/** Supabase 설정 (추후 입력)
 * Supabase 대시보드 → Settings → API에서 확인
 * 사용법: https://supabase.com/docs/reference/javascript
 */
const SUPABASE_CONFIG = {
  url: '',  // 예: 'https://xxxxx.supabase.co'
  anonKey: '',  // 예: 'eyJhbGciOiJI...'
}

let supabaseClient = null

function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.warn('Supabase: URL과 anonKey를 설정해주세요.')
    return null
  }
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
