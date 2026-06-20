/** Supabase Auth - 관리자 로그인 */
let authUser = null
let authListeners = []

function onAuthChange(fn) { authListeners.push(fn) }

async function checkAuth() {
  const sb = getSupabase()
  if (!sb) return null
  const { data: { user } } = await sb.auth.getUser()
  authUser = user
  return user
}

async function login(email, password) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase가 설정되지 않았습니다.')
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  authUser = data.user
  authListeners.forEach(fn => fn(authUser))
  return authUser
}

async function logout() {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
  authUser = null
  authListeners.forEach(fn => fn(null))
}

function showLoginModal() {
  const overlay = document.createElement('div')
  overlay.id = 'login-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999'
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:32px;width:360px;box-shadow:0 4px 24px rgba(0,0,0,0.2)">
      <h2 style="margin:0 0 20px;font-size:18px">관리자 로그인</h2>
      <div style="display:flex;flex-direction:column;gap:12px">
        <input id="login-email" type="email" placeholder="이메일" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
        <input id="login-password" type="password" placeholder="비밀번호" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
        <button id="login-btn" style="padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">로그인</button>
        <p id="login-error" style="color:#d32f2f;font-size:13px;margin:0;display:none"></p>
      </div>
    </div>`
  document.body.appendChild(overlay)
  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value
    const password = document.getElementById('login-password').value
    try {
      await login(email, password)
      overlay.remove()
      renderAll()
    } catch (e) {
      const err = document.getElementById('login-error')
      err.textContent = e.message
      err.style.display = 'block'
    }
  }
  document.getElementById('login-password').onkeydown = e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click()
  }
}
