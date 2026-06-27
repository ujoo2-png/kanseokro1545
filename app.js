/*
 * app.js — 건물 관리 시스템 메인 로직
 * 간석로1545 관리자 시스템 v1.16.0
 *
 * 히스토리
 * vv1.15.5 (2026-06) 모바일 URL 기본값 Vercel로 변경
 * vv1.15.5 (2026-06) 로그인 전체화면 전환, 배경클릭/F5 차단, 색상 테마 변경 (그린/아이보리)
 * vv1.15.5 (2026-06) 엑셀 업로드/다운로드, 로그인 화면 개선(프로그램명, Enter 이동), Vercel 배포
 * vv1.15.5 (2026-06) 인증 시스템, 민원/문의 페이지, 세입자 모바일 앱, Supabase 프레임워크
 * vv1.15.5 (2026-06) 대시보드 계약 만료 예정 (1/3/6개월) 위젯, 계약 파일 첨부
 * vv1.15.5 (2026-06) 선수금 관리 (월별 자동 차감) + 보증금 차감 기능 추가
 * v1.16.8 (2026-06) 복지할인 WELFARE 값 수정 + 청구월 기준 계약기간 포함 조회 (종료계약도 과거청구 복지 적용)
 * vv1.15.5 (2026-06) 청구서 페이지 디버그 정보, 필터/상세모달 정합성 개선
 * vv1.15.5 (2026-06) 청구서-세대 불일치 정합성 검사 + 청구 재생성 버튼
 * vv1.15.5 (2026-06) F5 새로고침 시 현재 메뉴 유지 (페이지 상태 localStorage 저장)
 * vv1.15.5 (2026-06) 입금등록: 청구건 기준 세대 자동 매칭 (불일치 원천 차단)
 * vv1.15.5 (2026-06) 수납-청구건 불일치 정합성 검사 및 자동 수정 기능
 * vv1.15.5 (2026-06) 연체료 자동 계산, 수납삭제, 연체추적 대시보드
 * vv1.15.5 (2026-06) 검색필터 전메뉴 적용, 엔티티명 클릭 상세보기, A6 명세서 출력, 정합성검토+검침누락, 세대명굵게, 검침량감소체크
 * vv1.15.5 (2026-06) 청구 재생성 버그 수정, 사용량/복지필드 저장, TV수신료, 검침 날짜정렬
 * vv1.15.5 (2026-06) 복지할인, 한국 전기/수도 누진제 요금 계산 엔진
 * vv1.15.5 (2026-06) 사이드바 슬라이딩 토글, 대시보드 계약현황, 천단위 콤마
 * vv1.15.5 (2026-06) 계약관리 고도화(비상연락처, 부동산명, 계좌), 세대관리 평수/가전
 * vv1.15.5 (2026-06) 초기 릴리스 — 건물/세대/계약/검침/청구/수납/공지 CRUD
 */

let state = { currentModal: null, editingId: null }

const WELFARE = {
  none: { elecDiscount: 0, waterDiscountPct: 0, label: '해당없음' },
  basic: { elecDiscount: 16000, elecSummer: 20000, waterDiscountPct: 0.3, label: '기초생활수급자' },
  next: { elecDiscount: 8000, waterDiscountPct: 0.2, label: '차상위계층' },
  disabled: { elecDiscount: 16000, elecSummer: 20000, waterDiscountPct: 0, label: '장애인' },
  multi: { elecDiscountPct: 0.3, elecDiscountMax: 16000, waterDiscountPct: 0, label: '다자녀' },
}

/**
 * 전기요금 계산 (한국 주택용 저압 누진제)
 * @param {number} kwh - 전력 사용량
 * @returns {number} - 부가세 포함 총 전기요금 (원)
 */
function calcElec(kwh, month) {
  const isSummer = month >= 7 && month <= 8
  const isWinter = month >= 12 || month <= 2
  const superuser = isSummer || isWinter
  let base = 0
  if (kwh <= 200) base += 910
  else if (kwh <= 400) base += 1600
  else base += 7300
  let remaining = kwh
  const t1 = Math.min(remaining, 200)
  base += t1 * 120; remaining -= t1
  if (remaining > 0) {
    const t2 = Math.min(remaining, 200)
    base += t2 * 214.6; remaining -= t2
  }
  if (remaining > 0) {
    const normal = Math.min(remaining, superuser ? 600 : Infinity)
    base += normal * 307.3; remaining -= normal
  }
  if (remaining > 0 && superuser) {
    base += remaining * 736.2
  } else if (remaining > 0) {
    base += remaining * 307.3
  }
  const envFee = kwh * 9
  const fuelFee = kwh * 5
  const subtotal = base + envFee + fuelFee
  const vat = Math.round(subtotal * 0.1)
  const fund = Math.floor(subtotal * 0.032 / 10) * 10
  return Math.floor((subtotal + vat + fund) / 10) * 10
}

/**
 * 수도요금 계산 (한국 가정용 누진제)
 * @param {number} m3 - 수도 사용량 (m³)
 * @returns {number} - 하수도/수질개선부담금 포함 총 수도요금 (원)
 */
function calcWater(m3) {
  let cost = 0, remaining = m3
  const tiers = [20, 15, Infinity], rates = [430, 590, 1170, 1280]
  for (let i = 0; i < tiers.length && remaining > 0; i++) {
    const usage = Math.min(remaining, tiers[i])
    cost += usage * rates[i]; remaining -= usage
  }
  cost += m3 * (300 + 170)
  return Math.round(cost)
}

/** 복지할인 대상의 한글 라벨 반환 */
function welfareLabel(w) {
  const e = WELFARE[w]
  if (!e) return '해당없음'
  return e.label + (e.elecDiscountPct ? ' (전기 ' + (e.elecDiscountPct * 100) + '%, ' + fmt(e.elecDiscountMax) + '원 한도)' : '')
}

/**
 * 연체료 계산 (일할: 미납액의 1% × 연체월수)
 * @param {number} unpaidAmount - 미납 금액
 * @param {number} overdueMonths - 연체 개월 수
 * @returns {number}
 */
function calcLateFee(unpaidAmount, overdueMonths) {
  if (overdueMonths <= 0 || unpaidAmount <= 0) return 0
  return Math.round(unpaidAmount * 0.01 * Math.min(overdueMonths, 12))
}

/** 사이드바 제목 클릭 시 대시보드로 이동 */
function goHome() {
  document.querySelectorAll('#nav a').forEach(x => x.classList.remove('active'))
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-dashboard').classList.add('active')
  document.getElementById('page-title').textContent = '대시보드'
  const tab = document.querySelector('#page-building .tab.active')
  if (tab) switchBuildingTab(tab.dataset.tab)
  document.querySelector('#nav a[data-page="dashboard"]').classList.add('active')
  savePageState()
}

/** 현재 페이지 상태를 localStorage에 저장 */
function savePageState() {
  const active = document.querySelector('#nav a.active')
  if (!active) return
  const state = { page: active.dataset.page }
  const buildingTab = document.querySelector('#page-building .tab.active')
  if (buildingTab) state.buildingTab = buildingTab.dataset.tab
  localStorage.setItem('kanseokro1545_page', JSON.stringify(state))
}

/** 저장된 페이지 상태 복원 */
function restorePageState() {
  const raw = localStorage.getItem('kanseokro1545_page')
  if (!raw) return
  try {
    const state = JSON.parse(raw)
    if (!state.page) return
    const link = document.querySelector(`#nav a[data-page="${state.page}"]`)
    if (!link) return
    document.querySelectorAll('#nav a').forEach(x => x.classList.remove('active'))
    link.classList.add('active')
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    const page = document.getElementById('page-' + state.page)
    if (page) page.classList.add('active')
    document.getElementById('page-title').textContent = link.textContent.trim()
    if (state.page === 'building' && state.buildingTab) {
      switchBuildingTab(state.buildingTab)
    }
  } catch (e) { /* ignore */ }
}

/** 앱 초기화 — Store 로드 → 네비게이션/모달/사이드바 설정 → 전체 렌더 + 통계 갱신 */
async function init() {
  await Store.init()
  const vl = document.getElementById('version-label')
  if (vl) vl.textContent = '관리자 시스템 ' + Store.version
  if (typeof ensureAdmin === 'function') ensureAdmin()
  setupNavigation()
  setupDraggableModal()
  setupSidebar()
  await checkAuth()
  applyAuthUI()
  onAuthChange(applyAuthUI)
  if (!currentUser) {
    showAuthModal('login')
    return
  }
  restorePageState()
  const activePage = document.querySelector('#nav a.active')
  if (activePage) {
    const p = activePage.dataset.page
    if (p === 'report') { initReportPage(); renderReports() }
    if (p === 'maintenance') renderMaintenance()
  }
  renderAll()
  updateStats()
}

async function doLogoutUI() {
  await logout()
  applyAuthUI()
  showAuthModal('login')
}

/* Sidebar toggle — localStorage에 접힘 상태 저장/복원 */
function setupSidebar() {
  const saved = localStorage.getItem('kanseokro1545_sidebar')
  if (saved === 'collapsed') document.getElementById('app').classList.add('sidebar-collapsed')
}

/** 사이드바 접기/펼치기 토글 */
function toggleSidebar() {
  const app = document.getElementById('app')
  app.classList.toggle('sidebar-collapsed')
  localStorage.setItem('kanseokro1545_sidebar', app.classList.contains('sidebar-collapsed') ? 'collapsed' : '')
}

/* Navigation — nav a 클릭 시 페이지 전환 + 활성화 */
function setupNavigation() {
  document.querySelectorAll('#nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      document.querySelectorAll('#nav a').forEach(x => x.classList.remove('active'))
      a.classList.add('active')
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
      const page = document.getElementById('page-' + a.dataset.page)
      if (page) page.classList.add('active')
      document.getElementById('page-title').textContent = a.textContent.trim()
      const tab = document.querySelector('#page-building .tab.active')
      if (tab) switchBuildingTab(tab.dataset.tab)
      const pageId = a.dataset.page
      if (pageId === 'report') { initReportPage(); renderReports() }
      if (pageId === 'maintenance') renderMaintenance()
      savePageState()
    })
  })
}

/* Building page tabs — 건물 상세 탭 전환 (정보/관리자/계좌) */
function switchBuildingTab(tabId) {
  document.querySelectorAll('#page-building .tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#page-building .tab-content').forEach(c => c.classList.remove('active'))
  document.querySelector(`#page-building .tab[data-tab="${tabId}"]`).classList.add('active')
  document.getElementById(tabId).classList.add('active')
}

/* Render — 모든 페이지 다시 그림 (검색필터 유지) */
function renderAll() {
  renderBuildings()
  renderUnits()
  renderContracts()
  renderMeters()
  populateBillFilter()
  renderBills()
  switchPaymentTab('payments')
  renderPayments()
  populatePrepaidFilter()
  renderPrepaids()
  renderNotices()
  renderInquiries()
  renderUsers()
  renderRecent()
  renderDashboardContracts()
  renderMaintenance()
  if (document.getElementById('page-report').classList.contains('active')) {
    initReportPage()
    renderReports()
  }
}

function renderBuildings() {
  const tbody = document.getElementById('building-tbody')
  let list = Store.getBuildings()
  const q = (document.getElementById('building-search')?.value || '').toLowerCase()
  if (q) list = list.filter(b => (b.name || '').toLowerCase().includes(q))
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7">등록된 건물이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = list.map(b => `
    <tr>
      ${_ck(b.id)}
      <td><a href="#" onclick="editBuilding(${b.id});return false" style="color:#2d5427;text-decoration:none">${b.name}</a></td>
      <td>${b.address || '-'}</td>
      <td>${b.adminName || '-'}</td>
      <td>${b.adminPhone || '-'}</td>
      <td>${b.bankName || '-'} ${b.accountNumber ? '(' + b.accountNumber + ')' : ''}</td>
      <td>
        <button class="btn btn-secondary" onclick="editBuilding(${b.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteBuilding(${b.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>
  `).join('')
}

/* Contract status filter */
let contractStatusFilter = ''
function setContractFilter(status) {
  contractStatusFilter = status
  document.querySelectorAll('.contract-filter-btn').forEach(b => {
    b.style.background = b.dataset.filter === status ? '#2d5427' : '#e8eaed'
    b.style.color = b.dataset.filter === status ? '#fff' : '#555'
    b.style.fontWeight = b.dataset.filter === status ? '600' : '400'
  })
  renderContracts()
}
/* Show contract history for a unit */
function showContractHistory(unitId) {
  const unit = Store.getUnits().find(u => u.id === unitId)
  const contracts = Store.getContracts().filter(c => c.unitId === unitId)
    .sort((a, b) => ((b.contractStart || '') > (a.contractStart || '') ? 1 : -1))
  const overlay = document.getElementById('modal-overlay')
  overlay.classList.remove('hidden')
  document.getElementById('modal-title').textContent = (unit ? unit.name : '알 수 없음') + ' — 계약 이력'
  document.getElementById('modal-body').innerHTML = !contracts.length
    ? '<p style="padding:20px;text-align:center;color:#888">등록된 계약이 없습니다.</p>'
    : '<div style="max-height:400px;overflow-y:auto">' + contracts.map(c => {
      const badge = c.status === 'active' ? 'badge-paid' : 'badge-unpaid'
      const l = c.status === 'active' ? '진행중' : '종료'
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee">
        <div>
          <strong>${esc(c.tenant || '-')}</strong>
          <span style="font-size:12px;color:#888;margin-left:8px">${c.contractStart || '-'} ~ ${c.contractEnd || '-'}</span>
          <span style="font-size:12px;color:#888;margin-left:8px">월세 ${fmt(c.rent)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge ${badge}">${l}</span>
          <button class="btn btn-secondary" onclick="closeModal();editContract(${c.id})" style="padding:3px 7px;font-size:11px">수정</button>
        </div>
      </div>`
    }).join('') + '</div>'
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">닫기</button>
    <button class="btn btn-primary" onclick="closeModal();showModal('contract',{unitId:${unitId}})" style="font-size:12px">+ 새 계약 등록</button>`
}

let _unitPage = 0
const UNIT_PAGE_SIZE = 25
function renderUnits() {
  const tbody = document.getElementById('unit-tbody')
  let units = Store.getUnits()
  const q = (document.getElementById('unit-search')?.value || '').toLowerCase()
  if (q) {
    units = units.filter(u =>
      (u.name || '').toLowerCase().includes(q)
    )
  }
  units = _sorted(units, 'unit-tbody', u => u.name)
  document.getElementById('sort-unit-tbody-name').textContent = _sortIcon('unit-tbody', 'name')
  if (!units.length) {
    tbody.innerHTML = '<tr><td colspan="15">등록된 세대가 없습니다.</td></tr>'
    document.getElementById('unit-pagination').innerHTML = ''
    return
  }
  const totalPages = Math.ceil(units.length / UNIT_PAGE_SIZE)
  if (_unitPage >= totalPages) _unitPage = totalPages - 1
  const start = _unitPage * UNIT_PAGE_SIZE
  const pageUnits = units.slice(start, start + UNIT_PAGE_SIZE)
  tbody.innerHTML = pageUnits.map((u, i) => {
    const bld = Store.getBuildings().find(b => b.id === u.buildingId)
    const hasActive = !!Store.getContracts().find(c => c.unitId === u.id && c.status === 'active')
    const vacantClass = hasActive ? '' : 'row-vacant'
    const bil = (t, v) => v === 'individual' ? `<span class="badge badge-pending" style="font-size:10px">${t} 개별</span>` : `<span class="badge badge-paid" style="font-size:10px">${t} 통합</span>`
    const billLabels = `${bil('전기', u.elecBillingType)} ${bil('수도', u.waterBillingType)}`
    return `<tr class="${vacantClass}">
      ${_ck(u.id)}
      <td style="color:#888;font-size:12px">${start + i + 1}</td>
      <td><a href="#" onclick="editUnit(${u.id});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${u.name}</a></td>
      <td>${bld ? bld.name : '-'}</td>
      <td>${u.area ? u.area + '평' : '-'}</td>
      <td>${billLabels}</td>
      <td>${yn(u.hasAC)}</td>
      <td>${yn(u.hasTV)}</td>
      <td>${yn(u.hasFridge)}</td>
      <td>${yn(u.hasWasher)}</td>
      <td>${yn(u.hasTVStand)}</td>
      <td>${yn(u.hasBed)}</td>
      <td>${yn(u.hasCloset)}</td>
      <td>
        <button class="btn btn-secondary" onclick="showContractHistory(${u.id})" style="padding:4px 8px;font-size:12px">계약</button>
      </td>
      <td>
        <button class="btn btn-secondary" onclick="editUnit(${u.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteUnit(${u.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>`
  }).join('')
  renderUnitPagination(totalPages)
}
function renderUnitPagination(totalPages) {
  const el = document.getElementById('unit-pagination')
  if (totalPages <= 1) { el.innerHTML = ''; return }
  let html = ''
  html += `<button class="btn btn-secondary" onclick="_unitPage=Math.max(0,_unitPage-1);renderUnits()" style="padding:3px 10px;font-size:12px" ${_unitPage === 0 ? 'disabled' : ''}>◀ 이전</button>`
  const from = Math.max(0, _unitPage - 2)
  const to = Math.min(totalPages, _unitPage + 3)
  for (let p = from; p < to; p++) {
    html += `<button class="btn ${p === _unitPage ? 'btn-primary' : 'btn-secondary'}" onclick="_unitPage=${p};renderUnits()" style="padding:3px 10px;font-size:12px">${p + 1}</button>`
  }
  html += `<button class="btn btn-secondary" onclick="_unitPage=Math.min(${totalPages - 1},_unitPage+1);renderUnits()" style="padding:3px 10px;font-size:12px" ${_unitPage >= totalPages - 1 ? 'disabled' : ''}>다음 ▶</button>`
  el.innerHTML = html
}

function renderContracts() {
  const tbody = document.getElementById('contract-tbody')
  let contracts = Store.getContracts()
  const q = (document.getElementById('contract-search')?.value || '').toLowerCase()
  if (q) {
    contracts = contracts.filter(c => {
      const unit = Store.getUnits().find(u => u.id === c.unitId)
      return (c.tenant || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.agency || '').toLowerCase().includes(q) ||
        (unit && unit.name.toLowerCase().includes(q))
    })
  }
  if (contractStatusFilter) {
    contracts = contracts.filter(c => c.status === contractStatusFilter)
  }
  contracts = _sorted(contracts, 'contract-tbody', c => { const u = Store.getUnits().find(x => x.id === c.unitId); return u ? u.name : '' })
  document.getElementById('sort-contract-tbody-name').textContent = _sortIcon('contract-tbody', 'name')
  if (!contracts.length) {
    tbody.innerHTML = '<tr><td colspan="19">등록된 계약이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = contracts.map(c => {
    const unit = Store.getUnits().find(u => u.id === c.unitId)
    const badge = c.status === 'active' ? 'badge-paid' : 'badge-unpaid'
    const label = c.status === 'active' ? '진행중' : '종료'
    const activeClass = c.status === 'active' ? 'row-active' : ''
    const hasFile = c.fileName && c.fileData
    return `<tr class="${activeClass}">
      ${_ck(c.id)}
      <td>${unit ? `<a href="#" onclick="editContract(${c.id});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${unit.name}</a>` : '알 수 없음'}</td>
      <td>${c.tenant || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.emergency || '-'}</td>
      <td>${c.emergencyRel || '-'}</td>
      <td>${c.agency || '-'}</td>
      <td>${c.contractStart || '-'} ~ ${c.contractEnd || '-'}</td>
      <td>${fmt(c.rent)}</td>
      <td>${fmt(c.maintenanceFee)}</td>
      <td>${fmt(c.deposit)}</td>
      <td>${c.bankName || '-'}</td>
      <td>${c.accountNumber || '-'}</td>
      <td>${c.accountHolder || '-'}</td>
      <td>${welfareLabel(c.welfare)}</td>
      <td>${hasFile ? `<a href="#" onclick="previewContractFile(${c.id});return false" style="color:#2d5427;text-decoration:none;font-size:12px" title="${esc(c.fileName)}">📎 ${esc(c.fileName)}</a>` : '-'}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td>
        <button class="btn btn-secondary" onclick="showContractHistory(${c.unitId})" style="padding:4px 8px;font-size:12px">이력</button>
        <button class="btn btn-secondary" onclick="editContract(${c.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteContract(${c.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>`
  }).join('')
}

function renderMeters() {
  const tbody = document.getElementById('meter-tbody')
  let meters = Store.getMeters()
  const q = (document.getElementById('meter-search')?.value || '').toLowerCase()
  if (q) {
    meters = meters.filter(m => {
      const unit = Store.getUnits().find(u => u.id === m.unitId)
      return unit && unit.name.toLowerCase().includes(q)
    })
  }
  const _sortMeter = (m) => {
    const s = _sort['meter-tbody']
    if (s && s.key === 'name') { const u = Store.getUnits().find(x => x.id === m.unitId); return u ? u.name : '' }
    if (s && s.key === 'date') return String(m.date || '')
    return ''
  }
  meters = _sorted(meters, 'meter-tbody', _sortMeter)
  document.getElementById('sort-meter-tbody-name').textContent = _sortIcon('meter-tbody', 'name')
  document.getElementById('sort-meter-tbody-date').textContent = _sortIcon('meter-tbody', 'date')
  if (!meters.length) {
      tbody.innerHTML = '<tr><td colspan="6">검침 데이터가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = meters.map(m => {
    const unit = Store.getUnits().find(u => u.id === m.unitId)
    return `<tr>
      ${_ck(m.id)}
      <td><a href="#" onclick="editMeter(${m.id});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
      <td>${m.date}</td>
      <td>${m.electricity || 0}</td>
      <td>${m.water || 0}</td>
      <td>
        <button class="btn btn-secondary" onclick="editMeter(${m.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteMeter(${m.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>`
  }).join('')
}

function populateBillFilter() {
  const ymSel = document.getElementById('bill-ym-filter')
  const unitSel = document.getElementById('bill-unit-filter')
  if (ymSel) {
    const current = ymSel.value
    const years = {}
    Store.getBills().forEach(b => {
      if (b.yearMonth) years[b.yearMonth.slice(0, 4)] = true
    })
    const thisYm = new Date().toISOString().slice(0, 7)
    const thisYear = thisYm.slice(0, 4)
    if (!years[thisYear]) years[thisYear] = true
    ymSel.innerHTML = '<option value="">전체 기간</option>'
    Object.keys(years).sort().reverse().forEach(y => {
      for (let m = 12; m >= 1; m--) {
        const ym = y + '-' + String(m).padStart(2, '0')
        ymSel.innerHTML += `<option value="${ym}">${y}년 ${m}월</option>`
      }
    })
    if (current) ymSel.value = current
    else ymSel.value = thisYm
  }
  if (unitSel) {
    const current = unitSel.value
    const units = Store.getUnits()
    unitSel.innerHTML = '<option value="">전체 세대</option>'
    units.forEach(u => {
      unitSel.innerHTML += `<option value="${u.id}" ${String(u.id) === current ? 'selected' : ''}>${esc(u.name)}</option>`
    })
    if (current) unitSel.value = current
  }
}

function renderBills() {
  const tbody = document.getElementById('billing-tbody')
  const ymFilter = document.getElementById('bill-ym-filter')
  const unitFilter = document.getElementById('bill-unit-filter')
  const statusFilter = document.getElementById('bill-status-filter')
  const filterYm = ymFilter ? ymFilter.value : ''
  const filterUnit = unitFilter ? parseInt(unitFilter.value) || 0 : 0
  const filterStatus = statusFilter ? statusFilter.value : ''
  const allUnits = Store.getUnits()
  const allBills = Store.getBills()
  let bills = allBills
  if (filterYm) bills = bills.filter(b => b.yearMonth === filterYm)
  let matchedUnitName = ''
  if (filterUnit) {
    const matchUnit = allUnits.find(u => u.id === filterUnit)
    matchedUnitName = matchUnit ? matchUnit.name : 'ID:' + filterUnit
    bills = bills.filter(b => b.unitId === filterUnit)
  }
  if (filterStatus) bills = bills.filter(b => b.status === filterStatus)
  const _sortBill = (b) => {
    const s = _sort['billing-tbody']
    if (s && s.key === 'name') { const u = Store.getUnits().find(x => x.id === b.unitId); return u ? u.name : '' }
    if (s && s.key === 'ym') return b.yearMonth || ''
    return ''
  }
  bills = _sorted(bills, 'billing-tbody', _sortBill)
  document.getElementById('sort-billing-tbody-name').textContent = _sortIcon('billing-tbody', 'name')
  document.getElementById('sort-billing-tbody-ym').textContent = _sortIcon('billing-tbody', 'ym')
  if (!bills.length) {
    tbody.innerHTML = `<tr><td colspan="15">청구 내역이 없습니다. (필터: ${filterYm || '전체'} / ${matchedUnitName || '전체'} / ${filterStatus || '전체'})</td></tr>`
    return
  }
  tbody.innerHTML = bills.map(b => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const badge = b.status === 'paid' ? 'badge-paid' : b.status === 'unpaid' ? 'badge-unpaid' : 'badge-pending'
    const label = b.status === 'paid' ? '납부완료' : b.status === 'unpaid' ? '미납' : '대기'
    const usageTag = (usage, unitLabel) => usage ? `<span style="font-size:11px;color:#888">(${usage}${unitLabel})</span>` : ''
    const hasActive = !!Store.getContracts().find(c => c.unitId === b.unitId && c.status === 'active')
    const vacantClass = hasActive ? '' : 'row-vacant'
    const prepaidAmt = allBills.length ? Store.getPayments().filter(p => p.billId === b.id && p.source === 'prepaid').reduce((s, p) => s + p.amount, 0) : 0
    const wf = WELFARE[b.welfareType]
    const wfDeduction = b.welfareDeduction || 0
    const welfareTag = wfDeduction > 0 ? `<span style="font-weight:700;color:#d32f2f;font-size:11px">-${fmt(wfDeduction)}</span>` : '-'
    return `<tr class="${vacantClass}">
      ${_ck(b.id)}
      <td><a href="#" onclick="showBillDetail(${b.id});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
      <td>${b.yearMonth}</td>
      <td>${fmt(b.rent)}</td>
      <td>${fmt(b.maintenanceFee)}</td>
      <td>${fmt(b.electricity)} ${usageTag(b.elecUsage, 'kWh')}</td>
      <td>${fmt(b.water)} ${usageTag(b.waterUsage, 'm³')}</td>
      <td>${fmt(b.tvFee)}</td>
      <td>${fmt(b.commonFee)}</td>
      <td>${fmt(b.lateFee)}</td>
      <td>${fmt(b.total)}</td>
      <td>${welfareTag}</td>
      <td>${prepaidAmt > 0 ? fmt(prepaidAmt) : '-'}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td><button class="btn btn-secondary" onclick="showBillDetail(${b.id})" style="padding:4px 8px;font-size:12px">상세</button></td>
    </tr>`
  }).join('')
}

function renderPayments() {
  const tbody = document.getElementById('payment-tbody')
  let payments = Store.getPayments()
  const q = (document.getElementById('payment-search')?.value || '').toLowerCase()
  if (q) {
    payments = payments.filter(p => {
      const unit = Store.getUnits().find(u => u.id === p.unitId)
      return unit && unit.name.toLowerCase().includes(q)
    })
  }
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="9">수납 내역이 없습니다.</td></tr>'
    return
  }
  const _sortPay = (p) => {
    const s = _sort['payment-tbody']
    const bill = Store.getBills().find(b => b.id === p.billId)
    if (s && s.key === 'name') { const u = Store.getUnits().find(x => x.id === p.unitId); return u ? u.name : '' }
    if (s && s.key === 'ym') return bill ? bill.yearMonth : ''
    if (s && s.key === 'date') return String(p.date || '')
    return ''
  }
  payments = _sorted(payments, 'payment-tbody', _sortPay)
  document.getElementById('sort-payment-tbody-name').textContent = _sortIcon('payment-tbody', 'name')
  document.getElementById('sort-payment-tbody-ym').textContent = _sortIcon('payment-tbody', 'ym')
  document.getElementById('sort-payment-tbody-date').textContent = _sortIcon('payment-tbody', 'date')
  tbody.innerHTML = payments.map(p => {
    const unit = Store.getUnits().find(u => u.id === p.unitId)
    const bill = Store.getBills().find(b => b.id === p.billId)
    const unpaid = bill ? bill.total - p.amount : 0
    const badge = unpaid <= 0 ? 'badge-paid' : unpaid >= bill.total ? 'badge-unpaid' : 'badge-pending'
    const label = unpaid <= 0 ? '완납' : unpaid >= bill.total ? '미납' : '부분납'
    const overdue = Store.getOverdueBills(p.unitId).find(o => o.bill.id === p.billId)
    const ob = overdue && overdue.overdueDays > 0 ? overdueBadge(overdue.overdueDays) : null
    const srcLabel = p.source === 'prepaid' ? ' (선수금)' : p.source === 'deposit' ? ' (보증금)' : ''
    return `<tr>
      ${_ck(p.id)}
      <td><a href="#" onclick="showBillDetail(${bill ? bill.id : 0});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
      <td>${bill ? bill.yearMonth : '-'}</td>
      <td>${fmt(bill ? bill.total : 0)}</td>
      <td>${fmt(p.amount)}${srcLabel}</td>
      <td>${fmt(unpaid)}</td>
      <td>${p.date}</td>
      <td>${ob ? `<span class="badge ${ob.cls}">${ob.label}</span>` : `<span class="badge ${badge}">${label}</span>`}</td>
      <td>${p.source && p.source !== 'manual' ? '' : `<button class="btn btn-secondary" onclick="deletePayment(${p.id})" style="padding:4px 8px;font-size:12px">삭제</button>`}</td>
    </tr>`
  }).join('')
}

/* Payment page tabs */
function switchPaymentTab(tabId) {
  document.querySelectorAll('#page-payment .tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#page-payment .tab-content').forEach(c => c.classList.remove('active'))
  document.querySelector(`#page-payment .tab[data-ptab="${tabId}"]`).classList.add('active')
  document.getElementById('ptab-' + tabId).classList.add('active')
  if (tabId === 'arrears') renderArrears()
  if (tabId === 'prepaids') renderPrepaids()
  if (tabId === 'deposits') renderDeposits()
}

/* Settings page tabs */
function switchSettingsTab(tabId) {
  document.querySelectorAll('#page-settings .tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#page-settings .tab-content').forEach(c => c.classList.remove('active'))
  document.querySelector(`#page-settings .tab[data-stab="${tabId}"]`).classList.add('active')
  document.getElementById(tabId).classList.add('active')
  if (tabId === 'tab-users') renderUsers()
  if (tabId === 'tab-mobile') {
    const saved = localStorage.getItem('kanseokro1545_mobile_url')
    const input = document.getElementById('mobile-url')
    if (input) {
      input.value = saved || 'https://kanseokro1545.vercel.app/mobile/'
      if (!saved) localStorage.setItem('kanseokro1545_mobile_url', input.value)
      updateQR()
    }
  }
}

/* QR code — 모바일 접속 URL을 QR코드 이미지로 표시 */
function updateQR() {
  const input = document.getElementById('mobile-url')
  if (!input) return
  const url = input.value.trim()
  if (!url) {
    document.getElementById('qr-image').style.display = 'none'
    return
  }
  // URL 저장
  localStorage.setItem('kanseokro1545_mobile_url', url)
  const img = document.getElementById('qr-image')
  img.style.display = 'block'
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=' + encodeURIComponent(url)
  img.onerror = function() {
    img.style.display = 'none'
    document.getElementById('qr-container').innerHTML += '<p style="color:#d32f2f;font-size:12px">QR코드를 불러올 수 없습니다</p>'
  }
}

/* QR 코드를 JPG/PNG로 다운로드 */
function downloadQR(format) {
  const img = document.getElementById('qr-image')
  if (!img.src) return alert('QR코드를 먼저 생성해주세요.')
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  // 흰 배경
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tempImg = new Image()
  tempImg.crossOrigin = 'anonymous'
  tempImg.onload = function() {
    ctx.drawImage(tempImg, 0, 0, 480, 480)
    // 하단에 URL 텍스트 추가
    ctx.fillStyle = '#333'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    const url = document.getElementById('mobile-url')?.value || ''
    ctx.fillText(url, 240, 470)
    canvas.toBlob(function(blob) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'kanseokro1545-mobile.' + format
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/' + format, 0.95)
  }
  tempImg.onerror = function() {
    alert('QR코드 이미지를 불러올 수 없습니다. 인터넷 연결을 확인하세요.')
  }
  tempImg.src = img.src
}

function renderArrears() {
  const tbody = document.getElementById('arrears-tbody')
  const summary = document.getElementById('arrears-summary')
  const units = Store.getUnits()
  const overdue = Store.getOverdueBills()
  if (!overdue.length) {
    tbody.innerHTML = '<tr><td colspan="8">미수금이 없습니다.</td></tr>'
    if (summary) summary.innerHTML = '<span>총 미수금: <strong>0원</strong></span>'
    return
  }
  const byUnit = {}
  for (const o of overdue) {
    if (!byUnit[o.bill.unitId]) byUnit[o.bill.unitId] = []
    byUnit[o.bill.unitId].push(o)
  }
  const rows = Object.keys(byUnit)
    .map(uid => {
      const unit = units.find(u => u.id === parseInt(uid))
      const items = byUnit[uid]
      const totalBilled = items.reduce((s, i) => s + i.bill.total, 0)
      const totalPaid = items.reduce((s, i) => s + i.paid, 0)
      const totalUnpaid = items.reduce((s, i) => s + i.unpaid, 0)
      const maxOverdue = Math.max(...items.map(i => i.overdueDays))
      const oldest = items.reduce((a, b) => a.bill.yearMonth < b.bill.yearMonth ? a : b)
      return { uid: parseInt(uid), name: unit ? unit.name : '?', count: items.length, totalBilled, totalPaid, totalUnpaid, maxOverdue, oldest }
    })
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid)
  const _sortArr = (r) => {
    const s = _sort['arrears-tbody']
    if (s && s.key === 'name') return r.name
    return ''
  }
  const sortedRows = _sorted(rows, 'arrears-tbody', _sortArr) || rows
  document.getElementById('sort-arrears-tbody-name').textContent = _sortIcon('arrears-tbody', 'name')
  const grandTotal = rows.reduce((s, r) => s + r.totalUnpaid, 0)
  if (summary) summary.innerHTML = `<span>연체 세대: <strong>${rows.length}세대</strong></span><span>총 미수금: <strong style="color:#d32f2f">${fmt(grandTotal)}</strong></span>`
  tbody.innerHTML = sortedRows.map(r => {
    const badgeCls = r.maxOverdue >= 60 ? 'badge-unpaid' : r.maxOverdue >= 30 ? 'badge-pending' : ''
    return `<tr>
      ${_ck(r.uid)}
      <td><a href="#" onclick="switchPaymentTab('payments');document.getElementById('payment-search').value='${esc(r.name)}';renderPayments();return false" style="color:#2d5427;text-decoration:none;font-weight:600">${esc(r.name)}</a></td>
      <td>${r.count}건</td>
      <td>${fmt(r.totalBilled)}</td>
      <td>${fmt(r.totalPaid)}</td>
      <td style="color:#d32f2f;font-weight:600">${fmt(r.totalUnpaid)}</td>
      <td><span class="badge ${badgeCls}">${r.maxOverdue}일</span></td>
      <td>${r.oldest.bill.yearMonth} ${fmt(r.oldest.unpaid)}</td>
    </tr>`
  }).join('')
}

function renderDeposits() {
  const tbody = document.getElementById('deposit-tbody')
  const summary = document.getElementById('deposit-summary')
  const units = Store.getUnits()
  const contracts = Store.getContracts()
  const deductions = Store.getDepositDeductions()
  const rows = []
  let totalOriginal = 0, totalDeducted = 0, totalRemaining = 0
  for (const c of contracts) {
    const unit = units.find(u => u.id === c.unitId)
    const unitDeductions = deductions.filter(d => d.unitId === c.unitId)
    const deducted = unitDeductions.reduce((s, d) => s + d.amount, 0)
    const currentDeposit = c.deposit || 0
    const originalDeposit = currentDeposit + deducted
    if (!originalDeposit && !deducted) continue
    totalOriginal += originalDeposit
    totalDeducted += deducted
    totalRemaining += currentDeposit
    const history = unitDeductions.map(d =>
      `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">
        <span style="font-size:12px;color:#666">${d.date}</span>
        <span style="color:#e65100">-${fmt(d.amount)}</span>
      </div>`
    ).join('')
    rows.push({
      name: unit ? unit.name : '?',
      period: (c.contractStart || '-') + ' ~ ' + (c.contractEnd || '-'),
      original: originalDeposit,
      deducted,
      remaining: currentDeposit,
      history: history || '<span style="color:#999;font-size:12px">-</span>'
    })
  }
  if (summary) summary.innerHTML =
    `<span>총 보증금: <strong>${fmt(totalOriginal)}</strong></span>
     <span>총 차감: <strong style="color:#e65100">${fmt(totalDeducted)}</strong></span>
     <span>총 잔액: <strong style="color:#1b5e20">${fmt(totalRemaining)}</strong></span>`
  tbody.innerHTML = rows.length ? rows.map(r =>
    `<tr>
      <td style="font-weight:600">${esc(r.name)}</td>
      <td style="font-size:12px;color:#666">${r.period}</td>
      <td>${fmt(r.original)}</td>
      <td style="color:#e65100">${fmt(r.deducted)}</td>
      <td style="color:#1b5e20;font-weight:600">${fmt(r.remaining)}</td>
      <td style="max-width:200px">${r.history}</td>
    </tr>`
  ).join('') : '<tr><td colspan="6">보증금 내역이 없습니다.</td></tr>'
}

/* Prepaid (선수금) */
function populatePrepaidFilter() {
  const sel = document.getElementById('prepaid-unit-filter')
  if (!sel) return
  const current = sel.value
  sel.innerHTML = '<option value="">전체 세대</option>'
  Store.getUnits().forEach(u => {
    sel.innerHTML += `<option value="${u.id}" ${String(u.id) === current ? 'selected' : ''}>${esc(u.name)}</option>`
  })
  if (current) sel.value = current
}

function renderPrepaids() {
  const tbody = document.getElementById('prepaid-tbody')
  const filter = document.getElementById('prepaid-unit-filter')
  let list = Store.getPrepaids()
  const fid = filter ? parseInt(filter.value) || 0 : 0
  if (fid) list = list.filter(p => p.unitId === fid)
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">선수금 내역이 없습니다.</td></tr>'
    return
  }
  const _sortPrep = (p) => {
    const s = _sort['prepaid-tbody']
    if (s && s.key === 'name') { const u = Store.getUnits().find(x => x.id === p.unitId); return u ? u.name : '' }
    if (s && s.key === 'date') return String(p.createdAt || '')
    return ''
  }
  list = _sorted(list, 'prepaid-tbody', _sortPrep)
  document.getElementById('sort-prepaid-tbody-name').textContent = _sortIcon('prepaid-tbody', 'name')
  document.getElementById('sort-prepaid-tbody-date').textContent = _sortIcon('prepaid-tbody', 'date')
  tbody.innerHTML = list.map(p => {
    const unit = Store.getUnits().find(u => u.id === p.unitId)
    return `<tr>
      ${_ck(p.id)}
      <td>${unit ? esc(unit.name) : '알 수 없음'}</td>
      <td>${fmt(p.amount)}</td>
      <td>${fmt(p.balance)}</td>
      <td>${p.createdAt || '-'}</td>
      <td><button class="btn btn-secondary" onclick="deletePrepaid(${p.id})" style="padding:4px 8px;font-size:12px">삭제</button></td>
    </tr>`
  }).join('')
}

/** 선수금 삭제 */
function deletePrepaid(id) {
  if (!confirm('선수금 기록을 삭제하시겠습니까?')) return
  Store.deletePrepaid(id)
  renderAll()
  updateStats()
}

/** 수납 삭제 → 해당 청구 상태 재계산 */
function deletePayment(id) {
  if (!confirm('입금 기록을 삭제하시겠습니까?')) return
  const p = Store.getPayments().find(py => py.id === id)
  if (!p) return
  if (p.source && p.source !== 'manual') return alert('선수금/보증금 차감 내역은 삭제할 수 없습니다.')
  Store.deletePayment(id)
  const bill = Store.getBills().find(b => b.id === p.billId)
  if (bill) {
    const totalPaid = Store.getPaidTotal(bill.id)
    if (totalPaid >= bill.total) Store.updateBill(bill.id, { status: 'paid' })
    else if (totalPaid > 0) Store.updateBill(bill.id, { status: 'pending' })
    else Store.updateBill(bill.id, { status: 'unpaid' })
  }
  renderAll()
  updateStats()
}

function renderNotices() {
  const tbody = document.getElementById('notice-tbody')
  let notices = Store.getNotices()
  const q = (document.getElementById('notice-search')?.value || '').toLowerCase()
  if (q) notices = notices.filter(n => (n.title || '').toLowerCase().includes(q))
  if (!notices.length) {
    tbody.innerHTML = '<tr><td colspan="5">공지가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = notices.map(n => `
    <tr>
      ${_ck(n.id)}
      <td><a href="#" onclick="showNoticeDetail(${n.id});return false" style="color:#2d5427;text-decoration:none">${n.title}</a></td>
      <td>${n.date}</td>
      <td><span class="badge ${n.sent ? 'badge-paid' : 'badge-pending'}">${n.sent ? '발송완료' : '미발송'}</span></td>
      <td>
        ${n.sent ? '' : `<button class="btn btn-primary" onclick="sendNotice(${n.id})" style="padding:4px 8px;font-size:12px">발송</button>`}
        <button class="btn btn-secondary" onclick="deleteNotice(${n.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>
  `).join('')
}

function renderInquiries() {
  const tbody = document.getElementById('inquiry-tbody')
  if (!tbody) return
  let list = Store.getInquiries()
  const q = (document.getElementById('inquiry-search')?.value || '').toLowerCase()
  if (q) list = list.filter(n => (n.title || '').toLowerCase().includes(q) || (n.unitName || '').toLowerCase().includes(q))
  const units = Store.getUnits()
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7">민원/문의가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = list.sort((a, b) => b.createdAt?.localeCompare(a.createdAt)).map(n => `
    <tr>
      ${_ck(n.id)}
      <td><a href="#" onclick="showInquiryDetail(${n.id});return false" style="color:#2d5427;text-decoration:none">${esc(n.title)}</a></td>
      <td>${esc(n.unitName || '')}</td>
      <td>${esc(n.userName || '')}</td>
      <td>${n.createdAt || ''}</td>
      <td><span class="badge ${n.reply ? 'badge-paid' : 'badge-pending'}">${n.reply ? '답변완료' : '대기중'}</span></td>
      <td>
        <button class="btn btn-primary" onclick="showInquiryDetail(${n.id})" style="padding:4px 8px;font-size:12px">답변</button>
        <button class="btn btn-secondary" onclick="deleteInquiry(${n.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>
  `).join('')
}

function showInquiryDetail(id) {
  const item = Store.getInquiries().find(n => n.id === id)
  if (!item) return
  showModal('inquiry-detail', item)
}

function deleteInquiry(id) {
  if (!confirm('삭제하시겠습니까?')) return
  Store.deleteInquiry(id)
  renderInquiries()
}

function renderRecent() {
  const tbody = document.getElementById('recent-tbody')
  const all = [
    ...Store.getBills().map(b => ({ date: b.yearMonth + '-01', text: `청구서 생성 - 세대 ID ${b.unitId}`, status: b.status })),
    ...Store.getPayments().map(p => ({ date: p.date, text: `입금 등록 - ${fmt(p.amount)}`, status: 'paid' })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10)
  if (!all.length) {
    tbody.innerHTML = '<tr><td colspan="3">데이터가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = all.map(a => {
    const badge = a.status === 'paid' ? 'badge-paid' : a.status === 'unpaid' ? 'badge-unpaid' : 'badge-pending'
    const label = a.status === 'paid' ? '완료' : a.status === 'unpaid' ? '미납' : '대기'
    return `<tr><td>${a.date}</td><td>${a.text}</td><td><span class="badge ${badge}">${label}</span></td></tr>`
  }).join('')
}

function renderUsers() {
  const tbody = document.getElementById('user-tbody')
  if (!tbody) return
  let users = Store.getUsers()
  const q = (document.getElementById('user-search')?.value || '').toLowerCase()
  if (q) users = users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q))
  const units = Store.getUnits()
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="10">등록된 사용자가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = users.map(u => {
    const roleLabel = { admin: '관리자', manager: '매니저', tenant: '입주자' }[u.role] || u.role
    const unitName = u.unitId ? (units.find(x => x.id === u.unitId)?.name || '-') : '-'
    const canDelete = currentUser && currentUser.id !== u.id
    const isPending = u.status !== 'active'
    return `<tr>
      ${_ck(u.id)}
      <td style="font-weight:600">${esc(u.username)}</td>
      <td>${esc(u.name || '-')}</td>
      <td>${esc(u.email || '-')}</td>
      <td>${esc(u.phone || '-')}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-paid' : u.role === 'manager' ? 'badge-pending' : 'badge-unpaid'}">${roleLabel}</span></td>
      <td>${unitName}</td>
      <td>${isPending ? '<span class="badge badge-unpaid">승인대기</span>' : '<span class="badge badge-paid">활성</span>'}</td>
      <td style="font-size:12px;color:#888">${u.createdAt || '-'}</td>
      <td style="white-space:nowrap">
        ${isPending ? `<button class="btn btn-primary" onclick="approveUser(${u.id})" style="padding:4px 8px;font-size:12px">승인</button>` : ''}
        <button class="btn btn-secondary" onclick="editUser(${u.id})" style="padding:4px 8px;font-size:12px">수정</button>
        ${canDelete ? `<button class="btn btn-secondary" onclick="deleteUser(${u.id})" style="padding:4px 8px;font-size:12px">삭제</button>` : ''}
      </td>
    </tr>`
  }).join('')
}

function approveUser(id) {
  Store.updateUser(id, { status: 'active' })
  renderAll()
}

function editUser(id) {
  const user = Store.getUsers().find(x => x.id === id)
  if (user) showModal('user', user)
}

function deleteUser(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return
  Store.deleteUser(id)
  renderAll()
}function updateStats() {
  const units = Store.getUnits()
  const bills = Store.getBills()
  const payments = Store.getPayments()
  document.getElementById('stat-units').textContent = units.length
  const totalBilling = bills.reduce((s, b) => s + (b.total || 0), 0)
  document.getElementById('stat-billing').textContent = fmt(totalBilling)
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  document.getElementById('stat-arrears').textContent = fmt(totalBilling - totalPaid)
  const unpaid = bills.filter(b => b.status !== 'paid').length
  document.getElementById('stat-unpaid').textContent = unpaid

  const overdue = Store.getOverdueBills()
  const overdue30 = overdue.filter(o => o.overdueDays >= 30 && o.overdueDays < 60).length
  const overdue60 = overdue.filter(o => o.overdueDays >= 60).length
  document.getElementById('stat-overdue30').textContent = overdue30
  document.getElementById('stat-overdue60').textContent = overdue60
  const totalPrepaid = (Store.getPrepaids() || []).reduce((s, p) => s + p.balance, 0)
  document.getElementById('stat-prepaid').textContent = fmt(totalPrepaid)
  const collRate = totalBilling > 0 ? Math.round((totalPaid / totalBilling) * 100) : 0
  document.getElementById('stat-collection-rate').textContent = collRate + '%'
}

/* Dashboard - contract status — 대시보드 세대별 계약현황 테이블 */
function renderDashboardContracts() {
  const tbody = document.getElementById('dashboard-contract-tbody')
  const units = Store.getUnits()
  document.getElementById('dashboard-date').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' 기준'
  if (!units.length) {
    tbody.innerHTML = '<tr><td colspan="4">등록된 세대가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = units.map(u => {
    const bld = Store.getBuildings().find(b => b.id === u.buildingId)
    const contract = Store.getContracts().filter(c => c.unitId === u.id).sort((a, b) => (b.contractStart || '').localeCompare(a.contractStart || ''))[0]
    const period = contract ? (contract.contractStart || '-') + ' ~ ' + (contract.contractEnd || '-') : '-'
    const badge = contract && contract.status === 'active' ? 'badge-paid' : 'badge-unpaid'
    const label = contract && contract.status === 'active' ? '계약중' : '계약없음'
    let until = ''
    if (contract && contract.contractEnd && contract.status === 'active') {
      const end = new Date(contract.contractEnd + 'T23:59:59')
      const now = new Date()
      const diff = end - now
      if (diff > 0) {
        const totalDays = Math.ceil(diff / (1000 * 60 * 60 * 24))
        const months = Math.floor(totalDays / 30)
        const days = totalDays % 30
        const cls = totalDays <= 30 ? 'badge-unpaid' : totalDays <= 90 ? 'badge-pending' : ''
        until = `<span class="badge ${cls}">${months}개월 ${days}일</span>`
      } else {
        until = `<span class="badge badge-unpaid">만료</span>`
      }
    } else {
      until = '-'
    }
    return `<tr>
      <td>${u.name}</td>
      <td>${bld ? bld.name : '-'}</td>
      <td>${period}</td>
      <td>${until}</td>
      <td><span class="badge ${badge}">${label}</span></td>
    </tr>`
  }).join('')

  renderExpiringContracts()
  renderDashboardExtensions()
}

function renderExpiringContracts() {
  const container = document.getElementById('expiring-content')
  const today = new Date()
  const contracts = Store.getContracts().filter(c => c.contractEnd && c.status === 'active')
  const units = Store.getUnits()

  const groups = { '1': [], '3': [], '6': [] }
  const thresholds = { '1': 30, '3': 90, '6': 180 }

  for (const c of contracts) {
    const end = new Date(c.contractEnd + 'T23:59:59')
    const daysLeft = Math.floor((end - today) / (1000 * 60 * 60 * 24))
    if (daysLeft < 0) continue
    if (daysLeft <= thresholds['1']) groups['1'].push({ c, daysLeft })
    else if (daysLeft <= thresholds['3']) groups['3'].push({ c, daysLeft })
    else if (daysLeft <= thresholds['6']) groups['6'].push({ c, daysLeft })
  }

  const colMeta = {
    '1': { label: '1개월 이내', color: '#d32f2f', bg: '#fbe9e7', dot: '#d32f2f' },
    '3': { label: '3개월 이내', color: '#e65100', bg: '#fff3e0', dot: '#e65100' },
    '6': { label: '6개월 이내', color: '#1565c0', bg: '#e3f2fd', dot: '#1565c0' },
  }

  const total = Object.values(groups).reduce((s, g) => s + g.length, 0)
  if (!total) {
    container.innerHTML = '<div style="padding:14px;color:#999;font-size:13px;text-align:center">만료 예정 계약이 없습니다.</div>'
    return
  }

  let html = '<div style="display:flex;gap:12px;align-items:stretch;padding:4px 16px 16px">'
  for (const key of ['1', '3', '6']) {
    const m = colMeta[key]
    const items = groups[key]
    html += `<div style="flex:1;min-width:0;background:${m.bg};border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px">`
    html += `<div style="font-size:13px;font-weight:600;color:${m.color};padding-bottom:6px;border-bottom:2px solid ${m.dot}33;display:flex;justify-content:space-between">${m.label} <span style="background:${m.dot};color:#fff;border-radius:10px;padding:0 8px;font-size:11px;line-height:20px">${items.length}</span></div>`
    if (!items.length) {
      html += `<div style="font-size:12px;color:#999;padding:10px 0;text-align:center">-</div>`
    } else {
      for (const { c, daysLeft } of items) {
        const unit = units.find(u => u.id === c.unitId)
        html += `<div style="background:#fff;border-radius:6px;padding:8px 10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);font-size:13px;border-left:3px solid ${m.dot}">`
        html += `<div style="font-weight:600;margin-bottom:2px">${esc(unit ? unit.name : '?')}</div>`
        html += `<div style="font-size:12px;color:#666">${c.contractEnd}</div>`
        html += `<div style="margin-top:4px"><span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;color:${m.color};background:${m.dot}18">D-${daysLeft}</span></div>`
        html += `</div>`
      }
    }
    html += `</div>`
  }
  html += '</div>'
  container.innerHTML = html
}

/* Draggable modal */
function setupDraggableModal() {
  const header = document.getElementById('modal-header')
  const modal = document.getElementById('modal')
  let isDragging = false, startX, startY, origX, origY

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.btn-close')) return
    isDragging = true
    modal.classList.add('dragging')
    const rect = modal.getBoundingClientRect()
    origX = rect.left
    origY = rect.top
    startX = e.clientX
    startY = e.clientY
    modal.style.left = origX + 'px'
    modal.style.top = origY + 'px'
    modal.style.transform = 'none'
  })

  document.addEventListener('mousemove', e => {
    if (!isDragging) return
    modal.style.left = (origX + e.clientX - startX) + 'px'
    modal.style.top = (origY + e.clientY - startY) + 'px'
  })

  document.addEventListener('mouseup', () => {
    if (!isDragging) return
    isDragging = false
    modal.classList.remove('dragging')
  })
}

/* Modal — 각 타입별 입력/상세 폼 생성 후 overlay 표시 */
function showModal(type, editData) {
  state.currentModal = type
  state.editingId = editData ? editData.id : null
  document.getElementById('modal-footer').innerHTML = '<button class="btn btn-secondary" onclick="closeModal()">취소</button><button class="btn btn-primary" id="modal-save" onclick="saveModal()">저장</button>'
  const overlay = document.getElementById('modal-overlay')
  const modal = document.getElementById('modal')
  overlay.classList.remove('hidden')
  modal.style.left = ''
  modal.style.top = ''
  modal.style.transform = 'translate(-50%, -50%)'
  const title = document.getElementById('modal-title')
  const body = document.getElementById('modal-body')
  switch (type) {
    case 'maintenance': { showMaintenanceModal(editData); return }
    case 'building': {
      title.textContent = editData ? '건물 수정' : '건물 추가'
      body.innerHTML = `
        <div class="form-group"><label>건물명</label><input id="f-bname" value="${editData ? esc(editData.name) : ''}"></div>
        <div class="form-group"><label>주소</label><input id="f-baddr" value="${editData ? esc(editData.address || '') : ''}"></div>
        <div class="form-group"><label>메모</label><textarea id="f-bmemo" rows="3">${editData ? esc(editData.memo || '') : ''}</textarea></div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">관리자 정보</h4>
        <div class="form-group"><label>관리자 이름</label><input id="f-badminname" value="${editData ? esc(editData.adminName || '') : ''}"></div>
        <div class="form-group"><label>핸드폰</label><input id="f-badminphone" value="${editData ? esc(editData.adminPhone || '') : ''}"></div>
        <div class="form-group"><label>이메일</label><input id="f-badminemail" type="email" value="${editData ? esc(editData.adminEmail || '') : ''}"></div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">관리 계좌정보</h4>
        <div class="form-group"><label>은행명</label><input id="f-bbank" value="${editData ? esc(editData.bankName || '') : ''}"></div>
        <div class="form-group"><label>예금주</label><input id="f-baccountholder" value="${editData ? esc(editData.accountHolder || '') : ''}"></div>
        <div class="form-group"><label>통장계좌번호</label><input id="f-baccount" value="${editData ? esc(editData.accountNumber || '') : ''}"></div>
      `
      break
    }
    case 'unit': {
      const buildings = Store.getBuildings()
      title.textContent = editData ? '세대 수정' : '세대 추가'
      const selYn = (key) => editData && editData[key]
      body.innerHTML = `
        <div class="form-group"><label>세대명 (예: 101호)</label><input id="f-uname" value="${editData ? esc(editData.name) : ''}"></div>
        <div class="form-group"><label>건물</label><select id="f-ubuilding"><option value="">선택 안함</option>${
          buildings.map(b => `<option value="${b.id}" ${editData && editData.buildingId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')
        }</select></div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">청구 방식</h4>
        <div style="display:flex;gap:12px">
          <div class="form-group" style="flex:1"><label>전기</label><select id="f-uelec">
            <option value="integrated" ${(!editData || editData.elecBillingType !== 'individual') ? 'selected' : ''}>통합 청구</option>
            <option value="individual" ${editData && editData.elecBillingType === 'individual' ? 'selected' : ''}>개별 신고</option>
          </select></div>
          <div class="form-group" style="flex:1"><label>수도</label><select id="f-uwat">
            <option value="integrated" ${(!editData || editData.waterBillingType !== 'individual') ? 'selected' : ''}>통합 청구</option>
            <option value="individual" ${editData && editData.waterBillingType === 'individual' ? 'selected' : ''}>개별 신고</option>
          </select></div>
        </div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">옵션 정보</h4>
        <div class="form-group"><label>평수</label><input id="f-uarea" type="number" value="${editData ? editData.area || '' : ''}"></div>
        <div class="form-group"><label>냉난방기</label><select id="f-uac"><option value="false">무</option><option value="true" ${selYn('hasAC') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>TV</label><select id="f-utv"><option value="false">무</option><option value="true" ${selYn('hasTV') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>냉장고</label><select id="f-ufridge"><option value="false">무</option><option value="true" ${selYn('hasFridge') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>세탁기</label><select id="f-uwash"><option value="false">무</option><option value="true" ${selYn('hasWasher') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>TV거실장</label><select id="f-utvstand"><option value="false">무</option><option value="true" ${selYn('hasTVStand') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>침대</label><select id="f-ubed"><option value="false">무</option><option value="true" ${selYn('hasBed') ? 'selected' : ''}>유</option></select></div>
        <div class="form-group"><label>옷장</label><select id="f-ucloset"><option value="false">무</option><option value="true" ${selYn('hasCloset') ? 'selected' : ''}>유</option></select></div>
      `
      break
    }
    case 'contract': {
      const units = Store.getUnits()
      title.textContent = editData ? '계약 수정' : '계약 추가'
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-cunit">${
          units.map(u => `<option value="${u.id}" ${editData && editData.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
        }</select></div>
        <div class="form-group"><label>세입자명</label><input id="f-ctenant" value="${editData ? esc(editData.tenant || '') : ''}"></div>
        <div class="form-group"><label>연락처</label><input id="f-cphone" value="${editData ? esc(editData.phone || '') : ''}"></div>
        <div class="form-group"><label>이메일</label><input id="f-cemail" type="email" value="${editData ? esc(editData.email || '') : ''}"></div>
        <div class="form-group"><label>비상연락처</label><input id="f-cemergency" value="${editData ? esc(editData.emergency || '') : ''}"></div>
        <div class="form-group"><label>비상연락처 관계</label><input id="f-cemergencyrel" value="${editData ? esc(editData.emergencyRel || '') : ''}"></div>
        <div class="form-group"><label>계약부동산명</label><input id="f-cagency" value="${editData ? esc(editData.agency || '') : ''}"></div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">송금계좌 정보</h4>
        <div class="form-group"><label>은행명</label><input id="f-cbank" value="${editData ? esc(editData.bankName || '') : ''}"></div>
        <div class="form-group"><label>계좌번호</label><input id="f-caccount" value="${editData ? esc(editData.accountNumber || '') : ''}"></div>
        <div class="form-group"><label>입금주</label><input id="f-caccountholder" value="${editData ? esc(editData.accountHolder || '') : ''}"></div>
        <h4 style="margin:16px 0 8px;font-size:14px;color:#555">복지할인 정보</h4>
        <div class="form-group"><label>복지할인 대상</label><select id="f-cwelfare">
          <option value="none" ${editData && editData.welfare === 'none' ? 'selected' : ''}>해당없음</option>
          <option value="basic" ${editData && editData.welfare === 'basic' ? 'selected' : ''}>기초생활수급자</option>
          <option value="next" ${editData && editData.welfare === 'next' ? 'selected' : ''}>차상위계층</option>
          <option value="disabled" ${editData && editData.welfare === 'disabled' ? 'selected' : ''}>장애인</option>
          <option value="multi" ${editData && editData.welfare === 'multi' ? 'selected' : ''}>다자녀</option>
        </select></div>
        <div class="form-group"><label>월세</label><input id="f-crent" type="text" inputmode="numeric" value="${editData ? fm(editData.rent) : ''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>관리비</label><input id="f-cmfee" type="text" inputmode="numeric" value="${editData ? fm(editData.maintenanceFee) : ''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>보증금</label><input id="f-cdeposit" type="text" inputmode="numeric" value="${editData ? fm(editData.deposit || '') : ''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>납부일</label><input id="f-cduedate" type="number" value="${editData ? editData.dueDate || 10 : 10}"></div>
        <div class="form-group"><label>계약 시작</label><input id="f-cstart" type="date" value="${editData ? editData.contractStart || '' : ''}"></div>
        <div class="form-group"><label>계약 종료</label><input id="f-cend" type="date" value="${editData ? editData.contractEnd || '' : ''}"></div>
        <div class="form-group" style="border-top:1px solid #eee;padding-top:10px;margin-top:6px">
          <label>계약서 파일</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="f-cfile" type="file" accept=".pdf,.jpg,.jpeg,.png" style="font-size:13px;flex:1;min-width:0">
            ${editData && editData.fileName ? `<span style="font-size:12px;color:#666">📎 ${esc(editData.fileName)}</span>
            <button type="button" class="btn btn-secondary" onclick="previewContractFile(${editData.id})" style="font-size:11px;padding:3px 8px">미리보기</button>
            <button type="button" class="btn btn-secondary" onclick="removeContractFile(${editData.id})" style="font-size:11px;padding:3px 8px">파일삭제</button>` : ''}
          </div>
        </div>
        <div class="form-group"><label>상태</label><select id="f-cstatus">
          <option value="active" ${editData && editData.status === 'active' ? 'selected' : ''}>진행중</option>
          <option value="ended" ${editData && editData.status === 'ended' ? 'selected' : ''}>종료</option>
        </select></div>
      `
      break
    }
    case 'meter': {
      const units = Store.getUnits()
      const isRealEdit = editData && editData.id
      title.textContent = isRealEdit ? '검침 수정' : '검침 입력'
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-unit">${
          units.map(u => `<option value="${u.id}" ${editData && editData.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
        }</select></div>
        <div class="form-group"><label>검침일</label><input id="f-date" type="date" value="${editData && editData.date ? editData.date : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>전기 (kWh)</label><input id="f-elec" type="number" step="0.1" value="${editData && editData.id ? editData.electricity : ''}"></div>
        <div class="form-group"><label>수도 (m³)</label><input id="f-water" type="number" step="0.1" value="${editData && editData.id ? editData.water : ''}"></div>
      `
      break
    }
    case 'payment': {
      const units = Store.getUnits()
      const unpaidBills = Store.getBills().filter(b => b.status !== 'paid')
      const defaultUnitId = editData ? editData.unitId : (unpaidBills.length ? unpaidBills[0].unitId : '')
      title.textContent = '입금 등록'
      body.innerHTML = `
        <div class="form-group"><label>세대</label>
          <select id="f-punit">${
            units.map(u => `<option value="${u.id}" ${u.id === defaultUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
          }</select>
        </div>
        <div class="form-group"><label>청구건 (세대명 - 청구월 - 금액)</label>
          <select id="f-pbill">${
            unpaidBills.length === 0
              ? '<option value="">미납 청구건이 없습니다</option>'
              : unpaidBills.map(b => {
                  const u = units.find(unit => unit.id === b.unitId)
                  return `<option value="${b.id}" data-unitid="${b.unitId}" ${b.unitId === defaultUnitId ? 'selected' : ''}>${esc(u ? u.name : '?')} - ${b.yearMonth} - ${fmt(b.total)}원 (잔여 ${fmt(b.total - Store.getPaidTotal(b.id))})</option>`
                }).join('')
          }</select>
        </div>
        <div class="form-group"><label>납부액</label><input id="f-pamount" type="text" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>납부일</label><input id="f-pdate" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      `
      const syncUnitFromBill = () => {
        const opt = document.getElementById('f-pbill').selectedOptions[0]
        if (opt && opt.value) {
          const billUnitId = parseInt(opt.dataset.unitid)
          document.getElementById('f-punit').value = billUnitId
        }
      }
      document.getElementById('f-pbill').addEventListener('change', syncUnitFromBill)
      document.getElementById('f-punit').addEventListener('change', () => {
        const uid = parseInt(document.getElementById('f-punit').value)
        Array.from(document.getElementById('f-pbill').options).forEach(o => {
          o.style.display = o.value && parseInt(o.dataset.unitid) === uid ? '' : 'none'
        })
      })
      break
    }
    case 'prepaid': {
      title.textContent = '선수금 등록'
      const units = Store.getUnits()
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-prepaid-unit">${
          units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')
        }</select></div>
        <div class="form-group"><label>입금액</label><input id="f-prepaid-amount" type="text" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>입금일</label><input id="f-prepaid-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>메모</label><input id="f-prepaid-memo" placeholder="선수금 사유 (선택)"></div>
      `
      break
    }
    case 'deposit-deduction': {
      title.textContent = '보증금 차감'
      const units = Store.getUnits()
      const contracts = Store.getContracts().filter(c => c.status === 'active')
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-dd-unit" onchange="updateDeductionInfo()">${
          units.map(u => {
            const c = contracts.find(ct => ct.unitId === u.id)
            const dep = c ? fmt(c.deposit || 0) : '0원'
            return `<option value="${u.id}" data-deposit="${c ? c.deposit || 0 : 0}">${esc(u.name)} (보증금 ${dep})</option>`
          }).join('')
        }</select></div>
        <div id="dd-info" style="font-size:13px;color:#555;margin-bottom:12px;padding:8px;background:#f5f5f5;border-radius:4px"></div>
        <div class="form-group"><label>차감 금액</label><input id="f-dd-amount" type="text" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>차감일</label><input id="f-dd-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>사유</label><input id="f-dd-memo" placeholder="연체 보증금 차감"></div>
        <div style="font-size:11px;color:#888;margin-top:4px">차감 시 해당 세대의 연체 청구건에 입금 처리되며, 계약 보증금에서 차감됩니다.</div>
      `
      break
    }
    case 'bill-detail': {
      title.textContent = '청구 상세 내역'
      const b = editData
      if (!b) { body.innerHTML = '<p>데이터를 찾을 수 없습니다.</p>'; break }
      const unit = Store.getUnits().find(u => u.id === b.unitId)
      const wf = WELFARE[b.welfareType]
      const welfareName = wf ? wf.label : '해당없음'
      const hasWelfare = wf && (wf.elecDiscount > 0 || wf.elecDiscountPct > 0)
      const hasWaterDiscount = wf && wf.waterDiscountPct > 0
      const wfActual = b.welfareDeduction || 0
      const wfDisplay = wfActual || (hasWelfare ? (wf.elecDiscount || wf.elecDiscountMax || 0) : 0)
      const elecFull = b.elecCost || (hasWelfare ? b.electricity + wfDisplay : b.electricity)
      const waterFull = b.waterCost || (hasWaterDiscount ? Math.round(b.water / (1 - wf.waterDiscountPct)) : b.water)
      const waterDeduct = b.waterDeduction || (hasWaterDiscount ? Math.round(waterFull * wf.waterDiscountPct) : 0)
      const row = (label, value) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #eee">${label}</td><td style="padding:4px 12px;border-bottom:1px solid #eee;text-align:right">${value}</td></tr>`
      const section = (title) => `<tr><td colspan="2" style="padding:6px 12px;background:#f5f5f5;font-weight:600;font-size:13px">${title}</td></tr>`
      const discountRow = (full, deduct, net, unit) => {
        if (deduct <= 0) return row(unit + '요금', fmt(full))
        return row(unit + '요금', fmt(full) + ' - <span style="color:#d32f2f;font-weight:600">' + fmt(deduct) + '</span> = <span style="font-weight:600">' + fmt(net) + '</span>')
      }
      const prepaidAmt = Store.getPayments().filter(p => p.billId === b.id && p.source === 'prepaid').reduce((s, p) => s + p.amount, 0)
      const depositAmt = Store.getPayments().filter(p => p.billId === b.id && p.source === 'deposit').reduce((s, p) => s + p.amount, 0)
      const actualDue = b.total - prepaidAmt - depositAmt
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
        ${section('세대 정보')}
        ${row('세대', esc(unit ? unit.name : '알 수 없음'))}
        ${row('청구월', b.yearMonth)}
        ${section('사용량')}
        ${row('전기 사용량', b.elecUsage ? fm(b.elecUsage) + ' kWh' : '0 kWh')}
        ${row('수도 사용량', b.waterUsage ? fm(b.waterUsage) + ' m³' : '0 m³')}
        ${section('청구 금액')}
        ${row('월세', fmt(b.rent))}
        ${row('관리비', fmt(b.maintenanceFee))}
        ${discountRow(elecFull, wfDisplay, b.electricity, '전기')}
        ${discountRow(waterFull, waterDeduct, b.water, '수도')}
        ${row('TV수신료', fmt(b.tvFee))}
        ${row('공용관리비', fmt(b.commonFee))}
        ${row('연체료', fmt(b.lateFee))}
        ${row('<strong>합계</strong>', '<strong>' + fmt(b.total) + '</strong>')}
        ${prepaidAmt > 0 ? row('선수금 차감', '<span style="color:#388e3c">-' + fmt(prepaidAmt) + '</span>') : ''}
        ${depositAmt > 0 ? row('보증금 차감', '<span style="color:#e65100">-' + fmt(depositAmt) + '</span>') : ''}
        ${(prepaidAmt > 0 || depositAmt > 0) ? row('<strong>실 납부액</strong>', '<strong>' + fmt(actualDue) + '</strong>') : ''}
      </table>`
      break
    }
    case 'meter-required': {
      title.textContent = '검침 데이터 부족'
      const list = editData && editData.units
      if (!list || !list.length) { body.innerHTML = '<p>해당 세대가 없습니다.</p>'; break }
      body.innerHTML = `
        <p style="margin:0 0 12px;font-size:13px;color:#d32f2f">
          다음 세대는 검침 데이터가 2회 미만이어서 청구를 생성할 수 없습니다.<br>
          먼저 검침을 입력해주세요.
        </p>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto">
          ${list.map(u => `
            <button class="btn btn-primary" onclick="showMeterInput(${u.id})" style="text-align:left;padding:8px 12px">
              ${esc(u.name)} 검침 입력 →
            </button>
          `).join('')}
        </div>
      `
      break
    }
    case 'integrity-check': {
      title.textContent = '데이터 정합성 검토'
      const orphanMeters = (editData && editData.orphanMeters) || []
      const noMeterUnits = (editData && editData.noMeterUnits) || []
      const badPayments = (editData && editData.badPayments) || []
      const badBills = (editData && editData.badBills) || []
      if (!orphanMeters.length && !noMeterUnits.length && !badPayments.length && !badBills.length) {
        body.innerHTML = '<p>문제가 없습니다.</p>'; break
      }
      let html = ''
      if (orphanMeters.length) {
        const oids = [...new Set(orphanMeters.map(m => m.unitId))]
        const ounits = oids.map(id => Store.getUnits().find(u => u.id === id)).filter(Boolean)
        html += `<p style="margin:0 0 8px;font-size:13px;color:#d32f2f">계약중이 아닌 세대의 검침 데이터 ${orphanMeters.length}건</p>
        <div style="margin-bottom:12px;font-size:12px"><strong>대상 세대:</strong> ${ounits.map(u => esc(u.name)).join(', ')}</div>`
      }
      if (noMeterUnits.length) {
        html += `<p style="margin:0 0 8px;font-size:13px;color:#e65100">계약중이지만 검침 데이터가 없는 세대 ${noMeterUnits.length}건</p>
        <div style="margin-bottom:12px;font-size:12px"><strong>대상 세대:</strong> ${noMeterUnits.map(u => esc(u.name)).join(', ')}</div>`
      }
      if (badPayments.length) {
        const bUnits = [...new Set(badPayments.map(p => p.unitId))].map(id => Store.getUnits().find(u => u.id === id)).filter(Boolean)
        html += `<p style="margin:0 0 4px;font-size:13px;color:#d32f2f">수납-청구건 세대 불일치 ${badPayments.length}건</p>
        <div style="margin-bottom:4px;font-size:12px"><strong>영향받은 세대:</strong> ${bUnits.map(u => esc(u.name)).join(', ')}</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px">입금 등록 시 선택한 세대와 청구건의 세대가 다른 경우입니다.</div>`
      }
      if (badBills.length) {
        html += `<p style="margin:0 0 4px;font-size:13px;color:#c5221f">청구서-세대 불일치 ${badBills.length}건</p>
        <div style="margin-bottom:4px;font-size:12px"><strong>내용:</strong><br>`
        html += badBills.map(b => {
          const unit = Store.getUnits().find(u => u.id === b.unitId)
          return `&nbsp;• ${b.yearMonth} - ${unit ? esc(unit.name) : '세대ID:' + b.unitId} - ${fmt(b.total)}`
        }).join('<br>')
        html += `</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px">청구서의 세대(unitId)가 존재하지 않거나 계약중이 아닌 경우입니다. [청구 재생성] 후 "일괄 청구 생성"을 다시 실행하세요.</div>`
      }
      body.innerHTML = html + `
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" onclick="closeModal()" style="flex:1">취소</button>
          ${orphanMeters.length ? '<button class="btn btn-primary" onclick="deleteOrphanMeters()" style="flex:1;background:#d32f2f">고아 검침 삭제</button>' : ''}
          ${badPayments.length ? '<button class="btn btn-primary" onclick="fixBadPayments()" style="flex:1;background:#e65100">수납 불일치 자동 수정</button>' : ''}
          ${badBills.length ? '<button class="btn btn-primary" onclick="clearBadBills()" style="flex:1;background:#c5221f">잘못된 청구 일괄 삭제</button>' : ''}
        </div>
      `
      break
    }
    case 'notice-detail': {
      title.textContent = '공지 내용'
      const n = editData
      if (!n) { body.innerHTML = '<p>데이터를 찾을 수 없습니다.</p>'; break }
      body.innerHTML = `
        <p style="font-size:15px;font-weight:600;margin-bottom:8px">${esc(n.title)}</p>
        <p style="font-size:12px;color:#888;margin-bottom:12px">${n.date || '-'} ${n.sent ? '· 발송완료' : '· 미발송'}</p>
        <div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(n.content || '')}</div>
      `
      break
    }
    case 'notice': {
      title.textContent = '공지 작성'
      body.innerHTML = `
        <div class="form-group"><label>제목</label><input id="f-ntitle"></div>
        <div class="form-group"><label>내용</label><textarea id="f-ncontent" rows="5"></textarea></div>
      `
      break
    }
    case 'inquiry-detail': {
      title.textContent = '민원/문의 상세'
      const n = editData
      if (!n) { body.innerHTML = '<p>데이터를 찾을 수 없습니다.</p>'; break }
      body.innerHTML = `
        <div style="margin-bottom:12px">
          <p style="font-size:15px;font-weight:600;margin-bottom:4px">${esc(n.title)}</p>
          <p style="font-size:12px;color:#888">${esc(n.userName || '')} · ${n.unitName || ''} · ${n.createdAt || ''}</p>
        </div>
        <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;padding:12px;background:#f9f9f9;border-radius:6px;margin-bottom:16px">${esc(n.content || '')}</div>
        ${n.reply ? `
          <div style="border-top:1px solid #e0e0e0;padding-top:12px">
            <p style="font-size:13px;font-weight:600;color:#2d5427;margin-bottom:4px">📨 관리자 답변</p>
            <p style="font-size:12px;color:#888;margin-bottom:8px">${n.repliedAt || ''}</p>
            <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;padding:12px;background:#e8f0fe;border-radius:6px">${esc(n.reply)}</div>
          </div>
        ` : `
          <div style="border-top:1px solid #e0e0e0;padding-top:12px">
            <div class="form-group"><label>답변</label><textarea id="f-inquiry-reply" rows="4" style="width:100%"></textarea></div>
          </div>
        `}
      `
      const saveBtn = document.getElementById('modal-save')
      if (n.reply) {
        saveBtn.style.display = 'none'
      } else {
        saveBtn.style.display = ''
        saveBtn.onclick = function saveInquiryReply() {
          const reply = document.getElementById('f-inquiry-reply')?.value.trim()
          if (!reply) return alert('답변을 입력하세요.')
          Store.updateInquiry(n.id, { reply, repliedAt: new Date().toISOString().slice(0, 10) })
          closeModal()
          renderInquiries()
        }
      }
      break
    }
    case 'user': {
      const isEdit = editData && editData.id
      title.textContent = isEdit ? '사용자 수정' : '사용자 추가'
      const units = Store.getUnits()
      body.innerHTML = `
        <div class="form-group"><label>아이디</label><input id="f-u-username" value="${editData ? esc(editData.username || '') : ''}" ${isEdit ? 'readonly style="background:#f5f5f5"' : ''}></div>
        <div class="form-group"><label>비밀번호 ${isEdit ? '(비워두면 유지)' : '*'}</label><input id="f-u-pw" type="password" value=""></div>
        <div class="form-group"><label>이름</label><input id="f-u-name" value="${editData ? esc(editData.name || '') : ''}"></div>
        <div class="form-group"><label>이메일</label><input id="f-u-email" type="email" value="${editData ? esc(editData.email || '') : ''}"></div>
        <div class="form-group"><label>연락처</label><input id="f-u-phone" value="${editData ? esc(editData.phone || '') : ''}"></div>
        <div class="form-group"><label>권한</label><select id="f-u-role">
          <option value="admin" ${editData && editData.role === 'admin' ? 'selected' : ''}>관리자</option>
          <option value="manager" ${editData && editData.role === 'manager' ? 'selected' : ''}>매니저</option>
          <option value="tenant" ${editData && editData.role === 'tenant' ? 'selected' : ''}>입주자</option>
        </select></div>
        <div class="form-group"><label>세대 (입주자)</label><select id="f-u-unit">
          <option value="">선택 안함</option>
          ${units.map(u => `<option value="${u.id}" ${editData && editData.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select></div>
      `
      break
    }
  }
}
function updateDeductionInfo() {
  const sel = document.getElementById('f-dd-unit')
  const info = document.getElementById('dd-info')
  if (!sel || !info) return
  const uid = parseInt(sel.value)
  const opt = sel.selectedOptions[0]
  const deposit = parseInt(opt.dataset.deposit) || 0
  const overdue = Store.getOverdueBills(uid)
  const totalOverdue = overdue.reduce((s, o) => s + o.unpaid, 0)
  info.innerHTML = `보증금: <strong>${fmt(deposit)}</strong> | 연체 합계: <strong style="color:${totalOverdue > 0 ? '#d32f2f' : '#388e3c'}">${fmt(totalOverdue)}</strong>`
}

/** 모달 닫기 (overlay 클릭 또는 직접 호출) */
function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) {
    const overlay = document.getElementById('modal-overlay')
    if (e.target === overlay) { overlay.classList.add('hidden'); return }
    if (!overlay.classList.contains('hidden')) return
  }
  document.getElementById('modal-overlay').classList.add('hidden')
}

/** 모달 저장 — 현재 열린 폼 데이터 수집 → Store 저장 → 리렌더 */
function saveModal() {
  const type = state.currentModal
  switch (type) {
    case 'maintenance': { saveMaintenanceModal(); break }
    case 'building': {
      const data = {
        name: document.getElementById('f-bname').value.trim(),
        address: document.getElementById('f-baddr').value.trim(),
        memo: document.getElementById('f-bmemo').value.trim(),
        adminName: document.getElementById('f-badminname').value.trim(),
        adminPhone: document.getElementById('f-badminphone').value.trim(),
        adminEmail: document.getElementById('f-badminemail').value.trim(),
        bankName: document.getElementById('f-bbank').value.trim(),
        accountHolder: document.getElementById('f-baccountholder').value.trim(),
        accountNumber: document.getElementById('f-baccount').value.trim(),
      }
      if (!data.name) return alert('건물명을 입력하세요.')
      if (state.editingId) Store.updateBuilding(state.editingId, data)
      else Store.addBuilding(data)
      break
    }
    case 'unit': {
      const data = {
        buildingId: parseInt(document.getElementById('f-ubuilding').value) || null,
        name: document.getElementById('f-uname').value.trim(),
        elecBillingType: document.getElementById('f-uelec').value,
        waterBillingType: document.getElementById('f-uwat').value,
        area: parseInt(document.getElementById('f-uarea').value) || 0,
        hasAC: document.getElementById('f-uac').value === 'true',
        hasTV: document.getElementById('f-utv').value === 'true',
        hasFridge: document.getElementById('f-ufridge').value === 'true',
        hasWasher: document.getElementById('f-uwash').value === 'true',
        hasTVStand: document.getElementById('f-utvstand').value === 'true',
        hasBed: document.getElementById('f-ubed').value === 'true',
        hasCloset: document.getElementById('f-ucloset').value === 'true',
      }
      if (!data.name) return alert('세대명을 입력하세요.')
      if (state.editingId) Store.updateUnit(state.editingId, data)
      else Store.addUnit(data)
      break
    }
    case 'contract': {
      const fileInput = document.getElementById('f-cfile')
      const data = {
        unitId: parseInt(document.getElementById('f-cunit').value),
        tenant: document.getElementById('f-ctenant').value.trim(),
        phone: document.getElementById('f-cphone').value.trim(),
        email: document.getElementById('f-cemail').value.trim(),
        emergency: document.getElementById('f-cemergency').value.trim(),
        emergencyRel: document.getElementById('f-cemergencyrel').value.trim(),
        agency: document.getElementById('f-cagency').value.trim(),
        bankName: document.getElementById('f-cbank').value.trim(),
        accountNumber: document.getElementById('f-caccount').value.trim(),
        accountHolder: document.getElementById('f-caccountholder').value.trim(),
        welfare: document.getElementById('f-cwelfare').value,
        rent: parseInt(document.getElementById('f-crent').value.replace(/,/g, '')) || 0,
        maintenanceFee: parseInt(document.getElementById('f-cmfee').value.replace(/,/g, '')) || 0,
        deposit: parseInt(document.getElementById('f-cdeposit').value.replace(/,/g, '')) || 0,
        dueDate: parseInt(document.getElementById('f-cduedate').value) || 10,
        contractStart: document.getElementById('f-cstart').value,
        contractEnd: document.getElementById('f-cend').value,
        status: document.getElementById('f-cstatus').value,
      }
      // 중복 진행중 계약 체크
      if (data.status === 'active') {
        const dup = Store.getContracts().find(c => c.id !== state.editingId && c.unitId === data.unitId && c.status === 'active')
        if (dup) {
          const u = Store.getUnits().find(u => u.id === data.unitId)
          return alert(`"${u ? u.name : '해당 세대'}"에 이미 진행중인 계약이 있습니다.\n기존 계약을 종료 후 새 계약을 등록해주세요.`)
        }
      }
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0]
        if (file.size > 10 * 1024 * 1024) return alert('파일 크기는 10MB 이하여야 합니다.')
        const reader = new FileReader()
        reader.onload = function (e) {
          data.fileName = file.name
          data.fileType = file.type
          data.fileData = e.target.result
          if (state.editingId) Store.updateContract(state.editingId, data)
          else Store.addContract(data)
          closeModal()
          renderAll()
        }
        reader.readAsDataURL(file)
        return
      }
      // 파일 변경이 없으면 기존 파일 유지 (editing 시)
      if (state.editingId) Store.updateContract(state.editingId, data)
      else Store.addContract(data)
      break
    }
    case 'meter': {
      const data = {
        unitId: parseInt(document.getElementById('f-unit').value),
        date: document.getElementById('f-date').value,
        electricity: parseFloat(document.getElementById('f-elec').value) || 0,
        water: parseFloat(document.getElementById('f-water').value) || 0,
      }
      if (!Store.getContracts().find(c => c.unitId === data.unitId && c.status === 'active')) {
        return alert('계약중인 세대만 검침 입력이 가능합니다.')
      }
      const prevMeters = Store.getMeters().filter(m => m.unitId === data.unitId && m.id !== state.editingId).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      const lastMeter = prevMeters[prevMeters.length - 1]
      if (lastMeter) {
        if (data.electricity < lastMeter.electricity || data.water < lastMeter.water) {
          return alert('검침량이 적습니다. 다시 검침 해 주세요.')
        }
      }
      if (state.editingId) Store.updateMeter(state.editingId, data)
      else Store.addMeter(data)
      break
    }
    case 'payment': {
      const billId = parseInt(document.getElementById('f-pbill').value)
      const bill = Store.getBills().find(b => b.id === billId)
      if (!bill) return alert('청구건을 선택하세요.')
      const data = {
        unitId: bill.unitId,
        billId,
        amount: parseInt(document.getElementById('f-pamount').value.replace(/,/g, '')) || 0,
        date: document.getElementById('f-pdate').value,
        source: 'manual',
      }
      if (data.amount <= 0) return alert('납부액을 입력하세요.')
      Store.addPayment(data)
      const totalPaid = Store.getPayments().filter(p => p.billId === billId).reduce((s, p) => s + p.amount, 0)
      if (totalPaid >= bill.total) Store.updateBill(billId, { status: 'paid' })
      else Store.updateBill(billId, { status: 'pending' })
      break
    }
    case 'prepaid': {
      const unitId = parseInt(document.getElementById('f-prepaid-unit').value)
      const amount = parseInt(document.getElementById('f-prepaid-amount').value.replace(/,/g, '')) || 0
      if (amount <= 0) return alert('입금액을 입력하세요.')
      Store.addPrepaid({
        unitId,
        amount,
        balance: amount,
        date: document.getElementById('f-prepaid-date').value,
        memo: document.getElementById('f-prepaid-memo').value.trim(),
      })
      break
    }
    case 'deposit-deduction': {
      const unitId = parseInt(document.getElementById('f-dd-unit').value)
      const amount = parseInt(document.getElementById('f-dd-amount').value.replace(/,/g, '')) || 0
      if (amount <= 0) return alert('차감 금액을 입력하세요.')
      const date = document.getElementById('f-dd-date').value
      const memo = document.getElementById('f-dd-memo').value.trim()
      const contract = Store.getContracts().find(c => c.unitId === unitId && c.status === 'active')
      if (!contract) return alert('계약중인 세대가 아닙니다.')
      const deposit = contract.deposit || 0
      if (amount > deposit) return alert(`보증금(${fmt(deposit)})보다 큰 금액을 차감할 수 없습니다.`)
      const overdueBills = Store.getOverdueBills(unitId)
      let remaining = amount
      for (const ob of overdueBills) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, ob.unpaid)
        Store.addPayment({
          unitId,
          billId: ob.bill.id,
          amount: deduct,
          date,
          source: 'deposit',
          memo: memo || '보증금 차감',
        })
        remaining -= deduct
        if (Store.getPaidTotal(ob.bill.id) >= ob.bill.total) {
          Store.updateBill(ob.bill.id, { status: 'paid' })
        } else {
          Store.updateBill(ob.bill.id, { status: 'pending' })
        }
      }
      contract.deposit -= amount
      Store.addDepositDeduction({ unitId, amount, date, memo, contractId: contract.id })
      Store.save()
      if (remaining > 0) alert(`차감 후 ${fmt(remaining)}원이 남았습니다. 보증금 잔액이 부족합니다.`)
      break
    }
    case 'notice': {
      const data = {
        title: document.getElementById('f-ntitle').value.trim(),
        content: document.getElementById('f-ncontent').value.trim(),
        date: new Date().toISOString().slice(0, 10),
        sent: false,
      }
      if (!data.title) return alert('제목을 입력하세요.')
      Store.addNotice(data)
      break
    }
    case 'user': {
      const isEdit = state.editingId
      const username = document.getElementById('f-u-username').value.trim()
      const pw = document.getElementById('f-u-pw').value
      const name = document.getElementById('f-u-name').value.trim()
      const email = document.getElementById('f-u-email').value.trim()
      const phone = document.getElementById('f-u-phone').value.trim()
      const role = document.getElementById('f-u-role').value
      const unitId = parseInt(document.getElementById('f-u-unit').value) || null
      if (!username) return alert('아이디를 입력하세요.')
      if (!name) return alert('이름을 입력하세요.')
      if (!isEdit) {
        if (!pw || pw.length < 4) return alert('비밀번호는 4자리 이상 입력하세요.')
        if (Store.getUsers().find(u => u.username === username)) return alert('이미 사용 중인 아이디입니다.')
        Store.addUser({
          username, password: btoa(pw), name, email, phone, role, unitId,
          status: 'active',
        })
      } else {
        const data = { name, email, phone, role, unitId }
        if (pw) data.password = btoa(pw)
        Store.updateUser(state.editingId, data)
      }
      break
    }
  }
  closeModal()
  renderAll()
  updateStats()
}

function editBuilding(id) {
  const item = Store.getBuildings().find(x => x.id === id)
  if (item) showModal('building', item)
}

function editUnit(id) {
  const unit = Store.getUnits().find(u => u.id === id)
  if (unit) showModal('unit', unit)
}

function editContract(id) {
  const item = Store.getContracts().find(x => x.id === id)
  if (item) showModal('contract', item)
}

function editMeter(id) {
  const meter = Store.getMeters().find(m => m.id === id)
  if (meter) showModal('meter', meter)
}

function deleteBuilding(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return
  Store.deleteBuilding(id)
  renderAll()
}

function deleteUnit(id) {
  if (!confirm('정말 삭제하시겠습니까? 관련된 검침/청구/수납/계약도 함께 삭제됩니다.')) return
  Store.deleteUnit(id)
  renderAll()
  updateStats()
}

/** 계약 삭제 */
function deleteContract(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return
  Store.deleteContract(id)
  renderAll()
}

function previewContractFile(id) {
  const c = Store.getContracts().find(x => x.id === id)
  if (!c || !c.fileData) return alert('첨부 파일이 없습니다.')
  const w = window.open('', '_blank')
  w.document.write(`<html><head><title>${c.fileName}</title><style>body{margin:0;display:flex;justify-content:center;background:#eee}iframe{width:100%;height:100vh;border:none}</style></head><body>`)
  if (c.fileType && c.fileType.startsWith('image/')) {
    w.document.write(`<img src="${c.fileData}" style="max-width:100%;max-height:100vh;object-fit:contain">`)
  } else {
    w.document.write(`<iframe src="${c.fileData}"></iframe>`)
  }
  w.document.write('</body></html>')
  w.document.close()
}

function removeContractFile(id) {
  if (!confirm('첨부 파일을 삭제하시겠습니까?')) return
  Store.updateContract(id, { fileName: undefined, fileType: undefined, fileData: undefined })
  renderAll()
}

/** 검침 삭제 (직접 Store._data 조작) */
function deleteMeter(id) {
  Store.deleteMeter(id)
  renderAll()
}

/** 공지 발송 → sent 플래그 업데이트 */
function sendNotice(id) {
  if (!confirm('공지를 전체 세대에 발송하시겠습니까?')) return
  Store.updateNotice(id, { sent: true, sentAt: new Date().toISOString() })
  renderAll()
  alert('공지가 발송되었습니다.')
}

/** 공지 삭제 */
function deleteNotice(id) {
  Store._data.notices = Store.getNotices().filter(n => n.id !== id)
  Store.save()
  renderAll()
}

/** 청구 생성 — 검침 기반 전기/수도 요금 계산 후 Bill 저장 (계약 유무 무관) */
function generateBills() {
  const units = Store.getUnits()
  if (!units.length) return alert('등록된 세대가 없습니다.')
  const defaultYm = new Date().toISOString().slice(0, 7)
  const ym = prompt('청구 대상 년월을 입력하세요 (YYYY-MM):', defaultYm)
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return alert('년월 형식이 올바르지 않습니다. (예: 2026-06)')
  const billUnits = units.filter(u => u.elecBillingType !== 'individual' || u.waterBillingType !== 'individual')
  if (!billUnits.length) return alert('통합 청구 대상 세대가 없습니다.')
  const existing = Store.getBills().filter(b => b.yearMonth === ym)
  if (existing.length) {
    if (!confirm(`${ym} 청구가 이미 ${existing.length}건 있습니다. 다시 생성하시겠습니까?`)) return
    Store._data.bills = Store.getBills().filter(b => b.yearMonth !== ym)
    Store.save()
  }
  const commonInput = prompt('세대당 공용관리비를 입력하세요 (원, 0이면 미부과):', '0')
  if (commonInput === null) return
  const commonFeePerUnit = parseInt(commonInput) || 0
  const prevYm = getPrevYearMonth(ym)
  const ymStart = ym + '-01'
  for (const u of billUnits) {
    const contract = Store.getContracts().find(c => {
      if (c.unitId !== u.id) return false
      if (c.status === 'active') return true
      return c.contractStart && c.contractEnd && c.contractStart <= ym + '-31' && c.contractEnd >= ymStart
    })
    const rent = contract ? contract.rent : 0
    const maintenanceFee = contract ? contract.maintenanceFee : 0
    const welfareId = contract ? (contract.welfare || 'none') : 'none'
    const allMeters = Store.getMeters().filter(m => m.unitId === u.id).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const ymEnd = ym + '-31'
    const inMonth = allMeters.filter(m => m.date <= ymEnd)
    const lastMeter = inMonth[inMonth.length - 1] || allMeters[allMeters.length - 1]
    const prevIdx = allMeters.indexOf(lastMeter) - 1
    const prevMeter = prevIdx >= 0 ? allMeters[prevIdx] : null
    let elecCost = 0, waterCost = 0
    let elecUsage = 0, waterUsage = 0
    if (lastMeter && prevMeter) {
      if (u.elecBillingType !== 'individual') {
        elecUsage = Math.max(0, lastMeter.electricity - prevMeter.electricity)
        elecCost = calcElec(elecUsage, parseInt(ym.split('-')[1]))
      }
      if (u.waterBillingType !== 'individual') {
        waterUsage = Math.max(0, lastMeter.water - prevMeter.water)
        waterCost = calcWater(waterUsage)
      }
    }
    const wf = WELFARE[welfareId]
    const month = parseInt(ym.split('-')[1])
    let elecDiscount = 0, waterDiscountPct = 0
    if (wf) {
      waterDiscountPct = wf.waterDiscountPct || 0
      if (wf.elecDiscountPct) {
        elecDiscount = Math.min(Math.round(elecCost * wf.elecDiscountPct), wf.elecDiscountMax || Infinity)
      } else {
        let base = wf.elecDiscount || 0
        if (wf.elecSummer && (month === 7 || month === 8)) base = wf.elecSummer
        elecDiscount = base
      }
    }
    const elecAfter = Math.round(Math.max(0, elecCost - elecDiscount))
    const waterAfter = Math.round(waterCost * (1 - waterDiscountPct))
    const elecDeduction = Math.round(Math.min(elecCost, elecDiscount))
    const waterDeduction = Math.round(waterCost * waterDiscountPct)
    const tvFee = 2500
    const commonFee = commonFeePerUnit

    const prevBill = Store.getBills().find(b => b.unitId === u.id && b.yearMonth === prevYm)
    let late = 0
    if (prevBill && prevBill.status === 'unpaid') {
      const paidOnPrev = Store.getPaidTotal(prevBill.id)
      const unpaidPrev = prevBill.total - paidOnPrev
      if (unpaidPrev > 0) {
        const overdueMonths = 1
        late = calcLateFee(unpaidPrev, overdueMonths)
      }
    }

    const total = rent + maintenanceFee + elecAfter + waterAfter + commonFee + tvFee + late
    const billId = Store._nextId()
    Store._data.bills.push({
      id: billId,
      unitId: u.id,
      yearMonth: ym,
      rent,
      maintenanceFee,
      electricity: elecAfter,
      water: waterAfter,
      commonFee,
      tvFee,
      lateFee: late,
      total,
      status: 'unpaid',
      elecUsage,
      waterUsage,
      welfareType: welfareId,
      welfareDeduction: elecDeduction,
      waterDeduction: waterDeduction,
      elecCost: Math.round(elecCost),
      waterCost: Math.round(waterCost),
    })
    const prepaidBalance = Store.getPrepaidBalance(u.id)
    if (prepaidBalance > 0) {
      const deduct = Math.min(total, prepaidBalance)
      Store.deductPrepaid(u.id, deduct)
      Store._data.payments.push({
        id: Store._nextId(),
        unitId: u.id,
        billId,
        amount: deduct,
        date: new Date().toISOString().slice(0, 10),
        source: 'prepaid',
      })
      const paid = Store.getPaidTotal(billId)
      if (paid >= total) {
        const idx = Store._data.bills.findIndex(b => b.id === billId)
        if (idx > -1) Store._data.bills[idx].status = 'paid'
      } else if (paid > 0) {
        const idx = Store._data.bills.findIndex(b => b.id === billId)
        if (idx > -1) Store._data.bills[idx].status = 'pending'
      }
    }
  }
  Store.save()
  renderAll()
  updateStats()
  alert(`${ym} 청구서가 생성되었습니다.`)
}

/** 전체 청구 데이터 삭제 후 재생성 안내 */
function clearAllBills() {
  const count = Store.getBills().length
  if (!count) return alert('삭제할 청구 데이터가 없습니다.')
  if (!confirm(`모든 청구 데이터(${count}건)를 삭제하시겠습니까? 삭제 후 "일괄 청구 생성"을 다시 실행해야 합니다.`)) return
  Store._data.bills = []
  Store.save()
  renderAll()
  updateStats()
  alert('모든 청구 데이터가 삭제되었습니다. "일괄 청구 생성" 버튼을 눌러 새로 생성하세요.')
}

/** 청구 상세 모달 열기 (사용량/복지할인 포함) */
function showBillDetail(id) {
  const bill = Store.getBills().find(b => b.id === id)
  if (!bill) return alert('청구 데이터를 찾을 수 없습니다.')
  showModal('bill-detail', bill)
}

/** 검침 부족 세대 → 검침 입력 모달 바로 열기 */
function showMeterInput(unitId) {
  closeModal()
  showModal('meter', { unitId })
}

/** 정합성 검토 — 계약/검침/청구/수납 전체 데이터 정합성 */
function checkMeterIntegrity() {
  const allMeters = Store.getMeters()
  const activeContracts = Store.getContracts().filter(c => c.status === 'active')
  const activeUnitIds = activeContracts.map(c => c.unitId)
  const orphanMeters = allMeters.filter(m => !activeUnitIds.includes(m.unitId))
  const noMeterUnitIds = activeUnitIds.filter(uid => !allMeters.some(m => m.unitId === uid))
  const noMeterUnits = noMeterUnitIds.map(uid => Store.getUnits().find(u => u.id === uid)).filter(Boolean)

  const badPayments = Store.getPayments().filter(p => {
    const bill = Store.getBills().find(b => b.id === p.billId)
    return bill && bill.unitId !== p.unitId
  })

  const badBills = Store.getBills().filter(b => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const contract = Store.getContracts().find(c => c.unitId === b.unitId && c.status === 'active')
    return !unit || !contract
  })

  if (!orphanMeters.length && !noMeterUnits.length && !badPayments.length && !badBills.length) {
    alert('모든 데이터가 정상입니다.')
    return
  }
  showModal('integrity-check', { orphanMeters, noMeterUnits, badPayments, badBills })
}

/** 고아 검침 데이터 일괄 삭제 (계약중 아닌 세대) */
function deleteOrphanMeters() {
  const before = Store.getMeters().length
  Store._data.meters = Store.getMeters().filter(m => {
    const hasActive = !!Store.getContracts().find(c => c.unitId === m.unitId && c.status === 'active')
    return hasActive
  })
  Store.save()
  const deleted = before - Store.getMeters().length
  closeModal()
  renderAll()
  alert(`${deleted}건의 검침 데이터가 삭제되었습니다.`)
}

/** unitId가 잘못된 청구 데이터 일괄 삭제 */
function clearBadBills() {
  const badBills = Store.getBills().filter(b => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const contract = Store.getContracts().find(c => c.unitId === b.unitId && c.status === 'active')
    return !unit || !contract
  })
  if (!badBills.length) return
  if (!confirm(`${badBills.length}건의 잘못된 청구를 삭제하고 새로 생성하시겠습니까?`)) return
  const ids = new Set(badBills.map(b => b.id))
  Store._data.bills = Store.getBills().filter(b => !ids.has(b.id))
  Store.save()
  closeModal()
  renderAll()
  updateStats()
  alert(`${badBills.length}건 삭제 완료. "일괄 청구 생성" 버튼으로 새로 생성하세요.`)
}

/** 수납-청구건 불일치 데이터 자동 수정 */
function fixBadPayments() {
  let fixed = 0
  Store.getPayments().forEach(p => {
    const bill = Store.getBills().find(b => b.id === p.billId)
    if (bill && bill.unitId !== p.unitId) {
      p.unitId = bill.unitId
      fixed++
    }
  })
  if (fixed > 0) {
    Store.save()
    closeModal()
    renderAll()
    updateStats()
    alert(`${fixed}건의 수납 데이터가 수정되었습니다.`)
  }
}

/** 공지 상세 읽기 모달 */
function showNoticeDetail(id) {
  const notice = Store.getNotices().find(n => n.id === id)
  if (!notice) return alert('공지를 찾을 수 없습니다.')
  showModal('notice-detail', notice)
}

/** A6 명세서 출력 미리보기 (A4 × 4 레이아웃, 새 창) */
function previewBillPrint() {
  const ymFilter = document.getElementById('bill-ym-filter')
  const filterYm = ymFilter ? ymFilter.value : ''
  const bills = Store.getBills().filter(b => !filterYm || b.yearMonth === filterYm)
  if (!bills.length) return alert('출력할 청구 데이터가 없습니다.')
  const ym = filterYm || (bills[0] ? bills[0].yearMonth : '')
  const sorted = [...bills].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || (a.id - b.id))

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>청구서 명세서</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Noto Sans KR", sans-serif; color: #222; }
  .page { width: 194mm; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .bill {
    width: 95.5mm; height: 139mm; border: 1px solid #888; padding: 3mm;
    display: flex; flex-direction: column; page-break-inside: avoid;
  }
  .bill .header { text-align: center; margin-bottom: 1mm; }
  .bill .header .title1 { font-size: 14pt; font-weight: 900; letter-spacing: 1pt; }
  .bill .header .title2 { font-size: 10pt; margin-top: 0.3mm; color: #333; }
  .bill .table-wrap { flex: 1; display: flex; flex-direction: column; overflow-x: auto; }
  .bill table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .bill th, .bill td { padding: 2mm 1.2mm; border-bottom: 1px solid #bbb; text-align: left; }
  .bill th { background: #f0f0f0; font-weight: 700; }
  .bill .right { text-align: right; }
  .bill .welfare-tag { font-size: 7pt; color: #d32f2f; font-weight: 700; margin-left: 0.5mm; }
  .bill .footer { margin-top: auto; padding-top: 1.5mm; font-size: 7pt; color: #555; line-height: 1.6; border-top: 1px solid #bbb; }
  .print-btn { display: block; margin: 10mm auto; padding: 8px 20px; font-size: 14px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ 인쇄</button>
<div class="page">`

  sorted.forEach((b, idx) => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const bld = unit ? Store.getBuildings().find(bg => bg.id === unit.buildingId) : null
    const contract = Store.getContracts().find(c => c.unitId === b.unitId && c.status === 'active')
    if (idx > 0 && idx % 4 === 0) html += `</div><div class="page" style="margin-top:4mm">`
    const dispYm = b.yearMonth.replace('-', '-') + '월분'
    const unitName = unit ? unit.name : '-'
    const wf = WELFARE[b.welfareType]
    const hasWelfare = wf && (wf.elecDiscount > 0 || wf.elecDiscountPct > 0)
    const hasWaterDiscount = wf && wf.waterDiscountPct > 0
    const wfActual = b.welfareDeduction || 0
    const wfDisplay = wfActual || (hasWelfare ? (wf.elecDiscount || wf.elecDiscountMax || 0) : 0)
    const waterDeduct = b.waterDeduction || (hasWaterDiscount ? Math.round((b.waterCost || Math.round(b.water / (1 - wf.waterDiscountPct))) * wf.waterDiscountPct) : 0)
    const elecFull = b.elecCost || (hasWelfare ? b.electricity + wfDisplay : b.electricity)
    html += `<div class="bill">
      <div class="header">
        <div class="title1">(${esc(unitName)}) 전기·수도청구서</div>
        <div class="title2">${dispYm}</div>
      </div>
      <div class="table-wrap">
      <table>
        <tr><th>항목</th><th class="right">금액</th></tr>
        <tr><td>월세</td><td class="right">${fmt(b.rent)}</td></tr>
        <tr><td>관리비</td><td class="right">${fmt(b.maintenanceFee)}</td></tr>
        <tr><td>전기요금</td><td class="right">${fmt(elecFull)}</td></tr>
        <tr><td>수도요금</td><td class="right">${fmt(b.waterCost || (hasWaterDiscount ? Math.round(b.water / (1 - wf.waterDiscountPct)) : b.water))}</td></tr>
        ${wfDisplay > 0 ? `<tr><td style="color:#d32f2f;font-size:9pt">복지할인(전기)</td><td class="right" style="color:#d32f2f;font-size:9pt">-${fmt(wfDisplay)}</td></tr>` : ''}
        ${waterDeduct > 0 ? `<tr><td style="color:#d32f2f;font-size:9pt">복지할인(수도)</td><td class="right" style="color:#d32f2f;font-size:9pt">-${fmt(waterDeduct)}</td></tr>` : ''}
        <tr><td>공용관리비</td><td class="right">${fmt(b.commonFee)}</td></tr>
        <tr><td>TV수신료</td><td class="right">${fmt(b.tvFee)}</td></tr>
        <tr><td>연체료</td><td class="right">${fmt(b.lateFee)}</td></tr>
        <tr><td style="font-weight:700;font-size:9pt">합계</td><td style="font-weight:700;font-size:9pt;text-align:right">${fmt(b.total)}</td></tr>
        ${(() => {
          const prepaidAmt = Store.getPayments().filter(p => p.billId === b.id && p.source === 'prepaid').reduce((s, p) => s + p.amount, 0)
          if (prepaidAmt <= 0) return ''
          return `<tr><td>선수금 차감</td><td class="right" style="color:#388e3c">-${fmt(prepaidAmt)}</td></tr>
        <tr><td style="font-weight:700;font-size:9pt">실 납부액</td><td style="font-weight:700;font-size:9pt;text-align:right">${fmt(b.total - prepaidAmt)}</td></tr>`
        })()}
      </table>
      </div>
      <div class="footer">
        <div><strong>${esc(bld ? bld.name : '건물')}</strong> 관리자 정보</div>
        <div>예금주: ${esc(bld ? (bld.accountHolder || '-') : '-')} | ${esc(bld ? (bld.bankName || '-') : '-')} ${esc(bld ? (bld.accountNumber || '') : '')}</div>
        <div>연락처: ${esc(bld ? (bld.adminPhone || '-') : '-')}</div>
        <div style="margin-top:0.5mm;font-size:6pt;color:#999">납부기한: ${b.yearMonth}-${String(contract ? (contract.dueDate || 10) : 10).padStart(2, '0')}</div>
      </div>
    </div>`
  })

  html += `</div></body></html>`
  const win = window.open('', '_blank', 'width=800,height=600')
  if (win) { win.document.write(html); win.document.close() }
}

/* Util */
/** 숫자를 '0,000원' 형식으로 포맷 */
function fmt(n) {
  return (n || 0).toLocaleString() + '원'
}

/** HTML 특수문자 이스케이프 (XSS 방지) */
function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

/** Boolean → 유/무 배지 HTML */
function yn(v) {
  return v ? '<span class="badge badge-paid">유</span>' : '<span class="badge badge-pending">무</span>'
}

/** 숫자를 천단위 콤마 문자열로 포맷 (단위 없음) */
function fm(n) {
  return (n || 0).toLocaleString()
}

/** 'YYYY-MM' 형식의 이전 달 반환 */
function getPrevYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

/** 연체일수에 따른 배지 클래스와 라벨 */
function overdueBadge(days) {
  if (days <= 0) return { cls: 'badge-paid', label: '정상' }
  if (days <= 30) return { cls: 'badge-pending', label: days + '일 연체' }
  if (days <= 60) return { cls: 'badge-unpaid', label: days + '일 연체' }
  return { cls: 'badge-danger', label: days + '일 연체 (심각)' }
}

/* ===== 대시보드 확장 ===== */

function renderDashboardExtensions() {
  renderTop5Arrears()
  renderCollectionChart()
  renderDashMaintenance()
}

function renderTop5Arrears() {
  const el = document.getElementById('dash-top5')
  if (!el) return
  const overdue = Store.getOverdueBills()
  const byUnit = {}
  for (const o of overdue) {
    if (!byUnit[o.bill.unitId]) byUnit[o.bill.unitId] = 0
    byUnit[o.bill.unitId] += o.unpaid
  }
  const sorted = Object.keys(byUnit)
    .map(uid => ({ unitId: parseInt(uid), unpaid: byUnit[uid] }))
    .sort((a, b) => b.unpaid - a.unpaid)
    .slice(0, 5)
  if (!sorted.length) {
    el.innerHTML = '<span style="color:#888">미수금이 없습니다.</span>'
    return
  }
  el.innerHTML = sorted.map((r, i) => {
    const unit = Store.getUnits().find(u => u.id === r.unitId)
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f5f5f5">
      <span><strong>${i + 1}.</strong> ${esc(unit ? unit.name : '?')}</span>
      <span style="color:#c62828;font-weight:600">${fmt(r.unpaid)}</span>
    </div>`
  }).join('')
}

function renderCollectionChart() {
  const canvas = document.getElementById('dash-collection-chart')
  if (!canvas) return
  const bills = Store.getBills()
  const payments = Store.getPayments()
  const ymMap = {}
  bills.forEach(b => {
    if (!ymMap[b.yearMonth]) ymMap[b.yearMonth] = { total: 0, paid: 0 }
    ymMap[b.yearMonth].total += b.total || 0
  })
  payments.forEach(p => {
    const b = bills.find(bx => bx.id === p.billId)
    if (b && ymMap[b.yearMonth]) ymMap[b.yearMonth].paid += p.amount || 0
  })
  const sorted = Object.keys(ymMap).sort().slice(-6)
  const labels = sorted.map(ym => ym.slice(2))
  const rates = sorted.map(ym => {
    const d = ymMap[ym]
    return d.total > 0 ? Math.round((d.paid / d.total) * 100) : 0
  })
  Chart.bar(canvas, labels, rates, {
    width: canvas.parentNode.clientWidth || 400,
    height: 160, barColor: '#2d5427',
    padding: { top: 16, right: 8, bottom: 28, left: 36 },
  })
  const avg = rates.length ? Math.round(rates.reduce((s, v) => s + v, 0) / rates.length) : 0
  document.getElementById('dash-collection-rate').textContent = `평균 ${avg}%`
}

function renderDashMaintenance() {
  const el = document.getElementById('dash-maintenance')
  const countEl = document.getElementById('dash-mnt-count')
  if (!el) return
  const records = Store.getMaintenanceRecords().filter(r => r.status === 'in_progress' || r.status === 'pending')
    .sort((a, b) => (a.id > b.id ? -1 : 1)).slice(0, 5)
  if (countEl) countEl.textContent = records.length + '건'
  if (!records.length) {
    el.innerHTML = '<span style="color:#888">진행중인 유지보수가 없습니다.</span>'
    return
  }
  el.innerHTML = records.map(r => {
    const unit = Store.getUnits().find(u => u.id === r.unitId)
    const cat = Store.getMaintenanceCategories().find(c => c.id === r.categoryId)
    const statusLabel = r.status === 'in_progress' ? '진행중' : '접수'
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:13px">
      <span><strong>${esc(unit ? unit.name : '?')}</strong> - ${esc(cat ? cat.name : r.title)}</span>
      <span style="color:${r.status === 'in_progress' ? '#1565c0' : '#e65100'}">${statusLabel}</span>
    </div>`
  }).join('')
}

/* ===== 유지보수 페이지 ===== */

let mntStatusFilter = ''

function setMntFilter(status) {
  mntStatusFilter = status
  document.querySelectorAll('.mnt-filter-btn').forEach(b => {
    b.style.background = b.dataset.mnt === status ? '#2d5427' : '#e8eaed'
    b.style.color = b.dataset.mnt === status ? '#fff' : '#555'
    b.style.fontWeight = b.dataset.mnt === status ? '600' : '400'
  })
  renderMaintenance()
}

function renderMaintenance() {
  const tbody = document.getElementById('mnt-tbody')
  const summaryTotal = document.getElementById('mnt-total')
  const summaryPending = document.getElementById('mnt-pending')
  const summaryProgress = document.getElementById('mnt-progress')
  const summaryDone = document.getElementById('mnt-done')
  const summaryCost = document.getElementById('mnt-cost')
  if (!tbody) return

  let records = Store.getMaintenanceRecords()
  const q = (document.getElementById('mnt-search')?.value || '').toLowerCase()
  if (q) {
    records = records.filter(r => {
      const unit = Store.getUnits().find(u => u.id === r.unitId)
      return (r.title || '').toLowerCase().includes(q) ||
        (unit && unit.name.toLowerCase().includes(q))
    })
  }
  if (mntStatusFilter) {
    records = records.filter(r => r.status === mntStatusFilter)
  }
  records.sort((a, b) => (b.id || 0) - (a.id || 0))

  if (summaryTotal) {
    const all = Store.getMaintenanceRecords()
    summaryTotal.textContent = all.length
    summaryPending.textContent = all.filter(r => r.status === 'pending').length
    summaryProgress.textContent = all.filter(r => r.status === 'in_progress').length
    summaryDone.textContent = all.filter(r => r.status === 'completed').length
    summaryCost.textContent = fmt(all.reduce((s, r) => s + (r.cost || 0), 0))
  }

  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="12">유지보수 내역이 없습니다.</td></tr>'
    return
  }

  tbody.innerHTML = records.map((r, i) => {
    const unit = Store.getUnits().find(u => u.id === r.unitId)
    const cat = Store.getMaintenanceCategories().find(c => c.id === r.categoryId)
    const statusBadge = r.status === 'completed' ? 'badge-paid'
      : r.status === 'in_progress' ? 'badge-pending'
      : r.status === 'cancelled' ? 'badge-unpaid' : 'badge-pending'
    const statusLabel = r.status === 'completed' ? '완료'
      : r.status === 'in_progress' ? '진행중'
      : r.status === 'cancelled' ? '취소' : '접수'
    const priorityLabel = { low: '낮음', normal: '보통', high: '높음', emergency: '긴급' }[r.priority] || '보통'
    const priorityCls = r.priority === 'high' ? 'mnt-priority-high'
      : r.priority === 'emergency' ? 'mnt-priority-emergency'
      : r.priority === 'normal' ? 'mnt-priority-normal' : ''
    return `<tr class="${priorityCls}">
      ${_ck(r.id)}
      <td>${records.length - i}</td>
      <td><a href="#" onclick="editMaintenance(${r.id});return false" style="color:#2d5427;text-decoration:none;font-weight:600">${unit ? esc(unit.name) : '?'}</a></td>
      <td>${esc(cat ? cat.name : '-')}</td>
      <td>${esc(r.title || '')}</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td style="font-size:12px">${priorityLabel}</td>
      <td>${fmt(r.cost || 0)}</td>
      <td>${esc(r.vendor || '-')}</td>
      <td>${r.scheduledDate || '-'}</td>
      <td>${r.completedDate || '-'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary" onclick="editMaintenance(${r.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteMaintenance(${r.id})" style="padding:4px 8px;font-size:12px">삭제</button>
        ${r.status === 'pending' ? `<button class="btn btn-primary" onclick="startMaintenance(${r.id})" style="padding:4px 8px;font-size:12px">시작</button>` : ''}
        ${r.status === 'in_progress' ? `<button class="btn btn-primary" onclick="completeMaintenance(${r.id})" style="padding:4px 8px;font-size:12px">완료</button>` : ''}
      </td>
    </tr>`
  }).join('')
}

function editMaintenance(id) {
  const item = Store.getMaintenanceRecords().find(r => r.id === id)
  if (item) showModal('maintenance', item)
}

function deleteMaintenance(id) {
  if (!confirm('삭제하시겠습니까?')) return
  Store.deleteMaintenanceRecord(id)
  renderAll()
  updateStats()
}

function startMaintenance(id) {
  if (!confirm('진행중으로 변경하시겠습니까?')) return
  Store.updateMaintenanceRecord(id, { status: 'in_progress', updatedAt: new Date().toISOString() })
  renderAll()
}

function completeMaintenance(id) {
  const r = Store.getMaintenanceRecords().find(x => x.id === id)
  const cost = prompt('완료 처리합니다. 총 비용을 입력하세요 (원):', String(r ? (r.cost || 0) : 0))
  if (cost === null) return
  const result = prompt('작업 결과 / 특이사항을 입력하세요:', r ? (r.result || '') : '')
  Store.updateMaintenanceRecord(id, {
    status: 'completed',
    completedDate: new Date().toISOString().slice(0, 10),
    cost: parseInt(cost.replace(/,/g, '')) || 0,
    result: result || '',
    updatedAt: new Date().toISOString(),
  })
  renderAll()
  updateStats()
}

/* ===== showModal / saveModal maintenance case ===== */

function showMaintenanceModal(editData) {
  const title = document.getElementById('modal-title')
  const body = document.getElementById('modal-body')
  title.textContent = editData ? '유지보수 수정' : '유지보수 등록'
  const units = Store.getUnits()
  const cats = Store.getMaintenanceCategories()
  const seen = new Set()
  const uniqueCats = cats.filter(c => { const dup = seen.has(c.name); seen.add(c.name); return !dup })
  body.innerHTML = `
    <div class="form-group"><label>세대</label><select id="f-mnt-unit">${
      units.map(u => `<option value="${u.id}" ${editData && editData.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
    }</select></div>
    <div class="form-group"><label>항목</label><select id="f-mnt-cat"><option value="">직접 입력</option>${
      uniqueCats.map(c => `<option value="${c.id}" ${editData && editData.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    }</select></div>
    <div class="form-group"><label>제목</label><input id="f-mnt-title" value="${editData ? esc(editData.title || '') : ''}"></div>
    <div class="form-group"><label>상세 설명</label><textarea id="f-mnt-desc" rows="3">${editData ? esc(editData.description || '') : ''}</textarea></div>
    <div style="display:flex;gap:12px">
      <div class="form-group" style="flex:1"><label>우선순위</label><select id="f-mnt-priority">
        <option value="low" ${editData && editData.priority === 'low' ? 'selected' : ''}>낮음</option>
        <option value="normal" ${editData && editData.priority === 'normal' ? 'selected' : ''}>보통</option>
        <option value="high" ${editData && editData.priority === 'high' ? 'selected' : ''}>높음</option>
        <option value="emergency" ${editData && editData.priority === 'emergency' ? 'selected' : ''}>긴급</option>
      </select></div>
      <div class="form-group" style="flex:1"><label>상태</label><select id="f-mnt-status">
        <option value="pending" ${!editData || editData.status === 'pending' ? 'selected' : ''}>접수</option>
        <option value="in_progress" ${editData && editData.status === 'in_progress' ? 'selected' : ''}>진행중</option>
        <option value="completed" ${editData && editData.status === 'completed' ? 'selected' : ''}>완료</option>
        <option value="cancelled" ${editData && editData.status === 'cancelled' ? 'selected' : ''}>취소</option>
      </select></div>
    </div>
    <div style="display:flex;gap:12px">
      <div class="form-group" style="flex:1"><label>비용 (원)</label><input id="f-mnt-cost" type="text" inputmode="numeric" value="${editData ? fm(editData.cost || 0) : ''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
      <div class="form-group" style="flex:1"><label>예정일</label><input id="f-mnt-sdate" type="date" value="${editData && editData.scheduledDate ? editData.scheduledDate : ''}"></div>
    </div>
    <div style="display:flex;gap:12px">
      <div class="form-group" style="flex:1"><label>업체명</label><input id="f-mnt-vendor" value="${editData ? esc(editData.vendor || '') : ''}"></div>
      <div class="form-group" style="flex:1"><label>업체 연락처</label><input id="f-mnt-vcontact" value="${editData ? esc(editData.vendorContact || '') : ''}"></div>
    </div>
    ${editData && (editData.status === 'completed' || editData.completedDate) ? `
    <div class="form-group"><label>완료일</label><input id="f-mnt-cdate" type="date" value="${editData.completedDate || ''}"></div>
    <div class="form-group"><label>작업 결과</label><textarea id="f-mnt-result" rows="2">${esc(editData.result || '')}</textarea></div>
    ` : ''}
  `
}

function saveMaintenanceModal() {
  const data = {
    unitId: parseInt(document.getElementById('f-mnt-unit').value),
    categoryId: parseInt(document.getElementById('f-mnt-cat').value) || null,
    title: document.getElementById('f-mnt-title').value.trim(),
    description: document.getElementById('f-mnt-desc').value.trim(),
    priority: document.getElementById('f-mnt-priority').value,
    status: document.getElementById('f-mnt-status').value,
    cost: parseInt(document.getElementById('f-mnt-cost').value.replace(/,/g, '')) || 0,
    scheduledDate: document.getElementById('f-mnt-sdate').value,
    vendor: document.getElementById('f-mnt-vendor').value.trim(),
    vendorContact: document.getElementById('f-mnt-vcontact').value.trim(),
    updatedAt: new Date().toISOString(),
  }
  const cdateEl = document.getElementById('f-mnt-cdate')
  const resultEl = document.getElementById('f-mnt-result')
  if (cdateEl) data.completedDate = cdateEl.value
  if (resultEl) data.result = resultEl.value.trim()
  if (!data.title) return alert('제목을 입력하세요.')
  if (!data.unitId) return alert('세대를 선택하세요.')
  if (state.editingId) Store.updateMaintenanceRecord(state.editingId, data)
  else Store.addMaintenanceRecord(data)
}

/* === 공통: 선택/정렬/일괄삭제 === */
const _sort = {}
function _sortBy(tid, key) {
  const s = _sort[tid] || {}
  _sort[tid] = { key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }
  renderAll()
}
function _sortIcon(tid, key) {
  const s = _sort[tid]
  if (!s || s.key !== key) return ''
  return s.dir === 'asc' ? ' ▲' : ' ▼'
}
function _sorted(list, tid, fn) {
  const s = _sort[tid]
  if (!s) return list
  return [...list].sort((a, b) => {
    const va = fn(a), vb = fn(b)
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
    return s.dir === 'asc' ? c : -c
  })
}
function _chkAll(tbodyId) {
  const cb = document.querySelector(`[data-chk-all="${tbodyId}"]`)
  if (!cb) return
  document.querySelectorAll(`#${tbodyId} .chk`).forEach(c => c.checked = cb.checked)
}
function _delSel(tbodyId, label) {
  const ids = Array.from(document.querySelectorAll(`#${tbodyId} .chk:checked`)).map(c => parseInt(c.value))
  if (!ids.length) return alert('선택된 항목이 없습니다.')
  if (!confirm(`${ids.length}개의 ${label}을(를) 삭제하시겠습니까?`)) return
  const tname = { 'building-tbody':'Building','unit-tbody':'Unit','contract-tbody':'Contract','meter-tbody':'Meter','billing-tbody':'Bill','payment-tbody':'Payment','prepaid-tbody':'Prepaid','deposit-tbody':'DepositDeduction','notice-tbody':'Notice','inquiry-tbody':'Inquiry','mnt-tbody':'MaintenanceRecord','user-tbody':'User' }[tbodyId]
  ids.forEach(id => {
    if (tname === 'Notice') deleteNotice(id)
    else if (tname === 'Bill') { Store._data.bills = Store.getBills().filter(b => b.id !== id); Store.save() }
    else Store['delete' + tname](id)
  })
  renderAll()
}
function _ck(id) { return `<td style="width:32px;text-align:center"><input type="checkbox" class="chk" value="${id}"></td>` }

init()
