/* Auth system — localStorage 기반 (추후 Supabase Auth로 전환) */
function esc(s) { return String(s).replace(/[<>&"']/g, function(m) { return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[m] }) }

// 첫 실행 시 기본 관리자 계정 생성
function ensureAdmin() {
  if (!Store.getUsers().find(u => u.role === 'admin')) {
    Store.addUser({
      username: 'admin',
      password: btoa('admin1234'),
      name: '관리자',
      email: 'admin@kanseokro.com',
      phone: '',
      role: 'admin',
      unitId: null,
      status: 'active',
      securityQuestion: '가장 좋아하는 색깔은?',
      securityAnswer: btoa('admin'),
    })
  }
}

let currentUser = null
let authListeners = []

function onAuthChange(fn) { authListeners.push(fn) }

function getSession() {
  const raw = sessionStorage.getItem('kanseokro1545_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function setSession(user) {
  if (user) {
    sessionStorage.setItem('kanseokro1545_session', JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role, unitId: user.unitId }))
  } else {
    sessionStorage.removeItem('kanseokro1545_session')
  }
  currentUser = user
  authListeners.forEach(fn => fn(user))
}

function checkAuth() {
  const s = getSession()
  if (!s) return null
  const user = Store.getUsers().find(u => u.id === s.id)
  currentUser = user
  return user
}

function hashPw(pw) { return btoa(pw) }

// --- API ---

function register(data) {
  const users = Store.getUsers()
  if (users.find(u => u.username === data.username)) return { error: '이미 사용 중인 아이디입니다.' }
  if (data.email && users.find(u => u.email === data.email)) return { error: '이미 사용 중인 이메일입니다.' }
  Store.addUser({
    username: data.username,
    password: hashPw(data.password),
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role || 'tenant',
    unitId: data.unitId || null,
    status: 'pending',
  })
  return { ok: true }
}

function checkUsername(username) {
  return !Store.getUsers().find(u => u.username === username)
}

function login(username, password) {
  const user = Store.findUserByUsername(username)
  if (!user) return { error: '아이디 또는 비밀번호가 일치하지 않습니다.' }
  if (user.password !== hashPw(password)) return { error: '아이디 또는 비밀번호가 일치하지 않습니다.' }
  if (user.status !== 'active') return { error: '관리자 승인 대기 중입니다. 관리자에게 문의하세요.' }
  setSession(user)
  return { ok: true, user }
}

function logout() {
  setSession(null)
}

function findId(email) {
  const user = Store.findUserByEmail(email)
  if (!user) return { error: '등록된 이메일이 없습니다.' }
  return { ok: true, username: user.username, createdAt: user.createdAt }
}

function findPassword(name, email) {
  const user = Store.getUsers().find(u => u.name === name && u.email === email)
  if (!user) return { error: '등록된 이름과 이메일이 일치하는 계정이 없습니다.' }
  return { ok: true, password: atob(user.password) }
}

function isAdmin() { return currentUser && currentUser.role === 'admin' }
function isManager() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') }
function isTenant() { return currentUser && currentUser.role === 'tenant' }

// --- UI ---

function showAuthModal(tab) {
  closeAuthModal()
  const overlay = document.createElement('div')
  overlay.id = 'auth-overlay'
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background:
      radial-gradient(circle at 20% 50%, rgba(26,115,232,0.08) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(21,87,176,0.1) 0%, transparent 50%),
      radial-gradient(circle at 50% 80%, rgba(255,255,255,0.05) 0%, transparent 50%),
      linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex; align-items: center; justify-content: center;
  `
  // SVG dot pattern overlay
  const pattern = document.createElement('div')
  pattern.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.08'
  pattern.innerHTML = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>`
  overlay.appendChild(pattern)
  document.body.appendChild(overlay)
  overlay.onclick = e => { if (e.target === overlay) closeAuthModal() }
  switchAuthTab(tab || 'login')
}

function closeAuthModal() {
  const el = document.getElementById('auth-overlay')
  if (el) el.remove()
}

function switchAuthTab(tab) {
  const container = document.getElementById('auth-overlay')
  if (!container) return
  const html = {
    login: `
      <div style="background:#fff;border-radius:12px;padding:32px;width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto">
        <div style="text-align:center;margin-bottom:20px">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#1a73e8">간석로1545</h1>
          <p style="margin:4px 0 0;font-size:12px;color:#888">관리자 시스템 v1.10.0</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <input id="af-id" type="text" placeholder="아이디" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none" onkeydown="if(event.key==='Enter') document.getElementById('af-pw').focus()">
          <input id="af-pw" type="password" placeholder="비밀번호" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none" onkeydown="if(event.key==='Enter') doLogin()">
          <button onclick="doLogin()" style="padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">로그인</button>
          <p id="af-err" style="color:#d32f2f;font-size:13px;margin:0;display:none"></p>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px">
            <a href="#" onclick="switchAuthTab('register');return false" style="color:#1a73e8;text-decoration:none">회원가입</a>
            <span>
              <a href="#" onclick="switchAuthTab('findId');return false" style="color:#1a73e8;text-decoration:none">아이디찾기</a>
              <span style="color:#ddd;margin:0 6px">|</span>
              <a href="#" onclick="switchAuthTab('findPw');return false" style="color:#1a73e8;text-decoration:none">비밀번호찾기</a>
            </span>
          </div>
        </div>
      </div>`,
    register: `
      <div style="background:#fff;border-radius:12px;padding:32px;width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto">
        <h2 style="margin:0 0 20px;font-size:18px">회원가입</h2>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label style="font-size:12px;color:#888">아이디 *</label>
            <div style="display:flex;gap:6px">
              <input id="af-reg-id" type="text" style="flex:1;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
              <button onclick="checkIdDup()" style="padding:8px 12px;background:#e8eaed;border:none;border-radius:8px;font-size:12px;cursor:pointer">중복확인</button>
            </div>
            <p id="af-reg-id-msg" style="font-size:11px;margin:2px 0 0;display:none"></p>
          </div>
          <div><label style="font-size:12px;color:#888">비밀번호 *</label><input id="af-reg-pw" type="password" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none"></div>
          <div><label style="font-size:12px;color:#888">비밀번호 확인 *</label><input id="af-reg-pw2" type="password" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none"></div>
          <div><label style="font-size:12px;color:#888">이름 *</label><input id="af-reg-name" type="text" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none"></div>
          <div><label style="font-size:12px;color:#888">이메일 * (아이디/비번 찾기에 사용)</label><input id="af-reg-email" type="email" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none"></div>
          <div><label style="font-size:12px;color:#888">연락처</label><input id="af-reg-phone" type="text" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none"></div>
          <button onclick="doRegister()" style="margin-top:4px;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">가입 신청</button>
          <p id="af-reg-err" style="color:#d32f2f;font-size:13px;margin:0;display:none"></p>
          <div style="text-align:center;font-size:13px">이미 계정이 있으신가요? <a href="#" onclick="switchAuthTab('login');return false" style="color:#1a73e8;text-decoration:none">로그인</a></div>
        </div>
      </div>`,
    findId: `
      <div style="background:#fff;border-radius:12px;padding:32px;width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.2)">
        <h2 style="margin:0 0 20px;font-size:18px">아이디 찾기</h2>
        <div style="display:flex;flex-direction:column;gap:10px">
          <p style="font-size:13px;color:#666;margin:0">가입 시 등록한 이메일을 입력하세요.</p>
          <input id="af-findid-email" type="email" placeholder="이메일" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
          <button onclick="doFindId()" style="padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">아이디 찾기</button>
          <p id="af-findid-rs" style="font-size:13px;margin:0;display:none"></p>
          <div style="text-align:center;font-size:13px"><a href="#" onclick="switchAuthTab('login');return false" style="color:#1a73e8;text-decoration:none">로그인으로 돌아가기</a></div>
        </div>
      </div>`,
    findPw: `
      <div style="background:#fff;border-radius:12px;padding:32px;width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.2)">
        <h2 style="margin:0 0 20px;font-size:18px">비밀번호 찾기</h2>
        <div style="display:flex;flex-direction:column;gap:10px">
          <p style="font-size:13px;color:#666;margin:0">가입 시 등록한 이름과 이메일을 입력하세요.</p>
          <input id="af-findpw-name" type="text" placeholder="이름" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
          <input id="af-findpw-email" type="email" placeholder="이메일" style="padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none">
          <button onclick="doFindPw()" style="padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">비밀번호 확인</button>
          <div id="af-findpw-rs" style="font-size:13px;margin:0;display:none;padding:10px;background:#f5f5f5;border-radius:6px;word-break:break-all"></div>
          <div style="text-align:center;font-size:13px"><a href="#" onclick="switchAuthTab('login');return false" style="color:#1a73e8;text-decoration:none">로그인으로 돌아가기</a></div>
        </div>
      </div>`,
  }[tab]
  if (!html) return
  container.innerHTML = html
  if (tab === 'register') {
    // register form has no special handlers now
  }
}

// --- Actions ---

function doLogin() {
  const id = document.getElementById('af-id').value.trim()
  const pw = document.getElementById('af-pw').value
  const err = document.getElementById('af-err')
  if (!id || !pw) { err.textContent = '아이디와 비밀번호를 입력하세요.'; err.style.display = 'block'; return }
  const r = login(id, pw)
  if (r.error) { err.textContent = r.error; err.style.display = 'block'; return }
  closeAuthModal()
  applyAuthUI()
  renderAll()
}

function doRegister() {
  const id = document.getElementById('af-reg-id').value.trim()
  const pw = document.getElementById('af-reg-pw').value
  const pw2 = document.getElementById('af-reg-pw2').value
  const name = document.getElementById('af-reg-name').value.trim()
  const email = document.getElementById('af-reg-email').value.trim()
  const phone = document.getElementById('af-reg-phone').value.trim()
  const err = document.getElementById('af-reg-err')
  if (!id) { err.textContent = '아이디를 입력하세요.'; err.style.display = 'block'; return }
  if (!pw || pw.length < 4) { err.textContent = '비밀번호는 4자리 이상 입력하세요.'; err.style.display = 'block'; return }
  if (pw !== pw2) { err.textContent = '비밀번호가 일치하지 않습니다.'; err.style.display = 'block'; return }
  if (!name) { err.textContent = '이름을 입력하세요.'; err.style.display = 'block'; return }
  if (!email) { err.textContent = '이메일을 입력하세요.'; err.style.display = 'block'; return }
  const r = register({ username: id, password: pw, name, email, phone, role: 'tenant', unitId: null })
  if (r.error) { err.textContent = r.error; err.style.display = 'block'; return }
  err.style.color = '#137333'
  err.textContent = '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.'
  err.style.display = 'block'
  document.querySelector('#auth-overlay > div > div > button')?.remove()
}

function checkIdDup() {
  const id = document.getElementById('af-reg-id').value.trim()
  const msg = document.getElementById('af-reg-id-msg')
  if (!id) { msg.textContent = '아이디를 입력하세요.'; msg.style.color = '#d32f2f'; msg.style.display = 'block'; return }
  const ok = checkUsername(id)
  msg.textContent = ok ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'
  msg.style.color = ok ? '#137333' : '#d32f2f'
  msg.style.display = 'block'
}

function doFindId() {
  const email = document.getElementById('af-findid-email').value.trim()
  const rs = document.getElementById('af-findid-rs')
  if (!email) { rs.textContent = '이메일을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  const r = findId(email)
  if (r.error) { rs.textContent = r.error; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  rs.innerHTML = `회원님의 아이디는 <strong>${r.username}</strong>입니다. (가입일: ${r.createdAt})`
  rs.style.color = '#137333'; rs.style.display = 'block'
}

let _findPwUsername = ''

function doFindPw() {
  const name = document.getElementById('af-findpw-name').value.trim()
  const email = document.getElementById('af-findpw-email').value.trim()
  const rs = document.getElementById('af-findpw-rs')
  if (!name) { rs.textContent = '이름을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  if (!email) { rs.textContent = '이메일을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  const r = findPassword(name, email)
  if (r.error) { rs.textContent = r.error; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  rs.innerHTML = `<div style="font-size:12px;color:#666;margin-bottom:4px">비밀번호</div><div style="font-size:16px;font-weight:600;color:#1a73e8;letter-spacing:1px">${r.password}</div>`
  rs.style.color = '#137333'; rs.style.display = 'block'
}

// --- UI integration ---

function applyAuthUI() {
  const user = currentUser
  document.getElementById('user-info').textContent = user ? (user.name + (user.role === 'admin' ? ' (관리자)' : user.role === 'manager' ? ' (매니저)' : ' (입주자)')) : '로그인 필요'
  document.getElementById('login-btn-top').style.display = user ? 'none' : 'inline-block'
  document.getElementById('logout-btn-top').style.display = user ? 'inline-block' : 'none'
  // Role-based menu visibility
  document.querySelectorAll('#nav a').forEach(a => {
    const page = a.dataset.page
    if (!user) { a.style.display = 'none'; return }
    if (user.role === 'admin') { a.style.display = 'block'; return }
    if (user.role === 'manager') {
      a.style.display = ['dashboard', 'meter', 'billing', 'payment', 'inquiry'].includes(page) ? 'block' : 'none'
      return
    }
    if (user.role === 'tenant') {
      a.style.display = ['dashboard', 'inquiry'].includes(page) ? 'block' : 'none'
      return
    }
  })
}
