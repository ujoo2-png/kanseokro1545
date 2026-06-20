/*
 * app.js — 건물 관리 시스템 메인 로직
 * 간석로1545 관리자 시스템 v1.6.0
 *
 * 히스토리
 * v1.6.0 (2026-06) 연체료 자동 계산, 수납삭제, 연체추적 대시보드, 세대-청구건 불일치 방지
 * v1.5.0 (2026-06) 검색필터 전메뉴 적용, 엔티티명 클릭 상세보기, A6 명세서 출력, 정합성검토+검침누락, 세대명굵게, 검침량감소체크
 * v1.4.0 (2026-06) 청구 재생성 버그 수정, 사용량/복지필드 저장, TV수신료, 검침 날짜정렬
 * v1.3.0 (2026-06) 복지할인, 한국 전기/수도 누진제 요금 계산 엔진
 * v1.2.0 (2026-06) 사이드바 슬라이딩 토글, 대시보드 계약현황, 천단위 콤마
 * v1.1.0 (2026-06) 계약관리 고도화(비상연락처, 부동산명, 계좌), 세대관리 평수/가전
 * v1.0.0 (2026-06) 초기 릴리스 — 건물/세대/계약/검침/청구/수납/공지 CRUD
 */

let state = { currentModal: null, editingId: null }

const WELFARE = {
  none: { elecDiscount: 0, waterDiscountPct: 0, label: '해당없음' },
  basic: { elecDiscount: 16000, waterDiscountPct: 0.3, label: '기초생활수급자' },
  next: { elecDiscount: 10000, waterDiscountPct: 0.2, label: '차상위계층' },
  disabled: { elecDiscount: 8000, waterDiscountPct: 0, label: '장애인' },
  multi: { elecDiscount: 8000, waterDiscountPct: 0, label: '다자녀' },
}

/**
 * 전기요금 계산 (한국 주택용 저압 누진제)
 * @param {number} kwh - 전력 사용량
 * @returns {number} - 부가세 포함 총 전기요금 (원)
 */
function calcElec(kwh) {
  let cost = 0
  if (kwh <= 200) cost += 910
  else if (kwh <= 400) cost += 1600
  else cost += 7300
  let remaining = kwh
  const t1 = Math.min(remaining, 200)
  cost += t1 * 98.5; remaining -= t1
  if (remaining > 0) {
    const t2 = Math.min(remaining, 200)
    cost += t2 * 184.6; remaining -= t2
  }
  if (remaining > 0) cost += remaining * 276.7
  cost *= 1.137
  return Math.round(cost)
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
  return WELFARE[w] ? WELFARE[w].label : '해당없음'
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
function init() {
  Store.init()
  setupNavigation()
  setupDraggableModal()
  setupSidebar()
  restorePageState()
  renderAll()
  updateStats()
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
  renderPayments()
  renderNotices()
  renderRecent()
  renderDashboardContracts()
}

function renderBuildings() {
  const tbody = document.getElementById('building-tbody')
  let list = Store.getBuildings()
  const q = (document.getElementById('building-search')?.value || '').toLowerCase()
  if (q) list = list.filter(b => (b.name || '').toLowerCase().includes(q))
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">등록된 건물이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td><a href="#" onclick="editBuilding(${b.id});return false" style="color:#1a73e8;text-decoration:none">${b.name}</a></td>
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

function renderUnits() {
  const tbody = document.getElementById('unit-tbody')
  let units = Store.getUnits()
  const q = (document.getElementById('unit-search')?.value || '').toLowerCase()
  if (q) {
    units = units.filter(u =>
      (u.name || '').toLowerCase().includes(q)
    )
  }
  if (!units.length) {
    tbody.innerHTML = '<tr><td colspan="11">등록된 세대가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = units.map(u => {
    const bld = Store.getBuildings().find(b => b.id === u.buildingId)
    const hasActive = !!Store.getContracts().find(c => c.unitId === u.id && c.status === 'active')
    const vacantClass = hasActive ? '' : 'row-vacant'
    return `<tr class="${vacantClass}">
      <td><a href="#" onclick="editUnit(${u.id});return false" style="color:#1a73e8;text-decoration:none;font-weight:600">${u.name}</a></td>
      <td>${bld ? bld.name : '-'}</td>
      <td>${u.area ? u.area + '평' : '-'}</td>
      <td>${yn(u.hasAC)}</td>
      <td>${yn(u.hasTV)}</td>
      <td>${yn(u.hasFridge)}</td>
      <td>${yn(u.hasWasher)}</td>
      <td>${yn(u.hasTVStand)}</td>
      <td>${yn(u.hasBed)}</td>
      <td>${yn(u.hasCloset)}</td>
      <td>
        <button class="btn btn-secondary" onclick="editUnit(${u.id})" style="padding:4px 8px;font-size:12px">수정</button>
        <button class="btn btn-secondary" onclick="deleteUnit(${u.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>`
  }).join('')
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
  if (!contracts.length) {
    tbody.innerHTML = '<tr><td colspan="16">등록된 계약이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = contracts.map(c => {
    const unit = Store.getUnits().find(u => u.id === c.unitId)
    const badge = c.status === 'active' ? 'badge-paid' : 'badge-unpaid'
    const label = c.status === 'active' ? '진행중' : '종료'
    const activeClass = c.status === 'active' ? 'row-active' : ''
    return `<tr class="${activeClass}">
      <td>${unit ? `<a href="#" onclick="editContract(${c.id});return false" style="color:#1a73e8;text-decoration:none;font-weight:600">${unit.name}</a>` : '알 수 없음'}</td>
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
      <td><span class="badge ${badge}">${label}</span></td>
      <td>
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
  if (!meters.length) {
    tbody.innerHTML = '<tr><td colspan="5">검침 데이터가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = meters.map(m => {
    const unit = Store.getUnits().find(u => u.id === m.unitId)
    return `<tr>
      <td><a href="#" onclick="editMeter(${m.id});return false" style="color:#1a73e8;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
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
    ymSel.innerHTML = '<option value="">전체 기간</option>'
    Object.keys(years).sort().reverse().forEach(y => {
      for (let m = 12; m >= 1; m--) {
        const ym = y + '-' + String(m).padStart(2, '0')
        ymSel.innerHTML += `<option value="${ym}">${y}년 ${m}월</option>`
      }
    })
    if (current) ymSel.value = current
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
  let bills = Store.getBills()
  if (filterYm) bills = bills.filter(b => b.yearMonth === filterYm)
  if (filterUnit) bills = bills.filter(b => b.unitId === filterUnit)
  if (filterStatus) bills = bills.filter(b => b.status === filterStatus)
  bills.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || (a.id - b.id))
  if (!bills.length) {
    tbody.innerHTML = '<tr><td colspan="12">청구 내역이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = bills.map(b => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const badge = b.status === 'paid' ? 'badge-paid' : b.status === 'unpaid' ? 'badge-unpaid' : 'badge-pending'
    const label = b.status === 'paid' ? '납부완료' : b.status === 'unpaid' ? '미납' : '대기'
    const usageTag = (usage, unitLabel) => usage ? `<span style="font-size:11px;color:#888">(${usage}${unitLabel})</span>` : ''
    const hasActive = !!Store.getContracts().find(c => c.unitId === b.unitId && c.status === 'active')
    const vacantClass = hasActive ? '' : 'row-vacant'
    return `<tr class="${vacantClass}">
      <td><a href="#" onclick="showBillDetail(${b.id});return false" style="color:#1a73e8;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
      <td>${b.yearMonth}</td>
      <td>${fmt(b.rent)}</td>
      <td>${fmt(b.maintenanceFee)}</td>
      <td>${fmt(b.electricity)} ${usageTag(b.elecUsage, 'kWh')}</td>
      <td>${fmt(b.water)} ${usageTag(b.waterUsage, 'm³')}</td>
      <td>${fmt(b.commonFee)}</td>
      <td>${fmt(b.tvFee)}</td>
      <td>${fmt(b.lateFee)}</td>
      <td>${fmt(b.total)}</td>
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
    tbody.innerHTML = '<tr><td colspan="8">수납 내역이 없습니다.</td></tr>'
    return
  }
  payments.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id))
  tbody.innerHTML = payments.map(p => {
    const unit = Store.getUnits().find(u => u.id === p.unitId)
    const bill = Store.getBills().find(b => b.id === p.billId)
    const unpaid = bill ? bill.total - p.amount : 0
    const badge = unpaid <= 0 ? 'badge-paid' : unpaid >= bill.total ? 'badge-unpaid' : 'badge-pending'
    const label = unpaid <= 0 ? '완납' : unpaid >= bill.total ? '미납' : '부분납'
    const overdue = Store.getOverdueBills(p.unitId).find(o => o.bill.id === p.billId)
    const ob = overdue && overdue.overdueDays > 0 ? overdueBadge(overdue.overdueDays) : null
    return `<tr>
      <td><a href="#" onclick="showBillDetail(${bill ? bill.id : 0});return false" style="color:#1a73e8;text-decoration:none;font-weight:600">${unit ? unit.name : '알 수 없음'}</a></td>
      <td>${bill ? bill.yearMonth : '-'}</td>
      <td>${fmt(bill ? bill.total : 0)}</td>
      <td>${fmt(p.amount)}</td>
      <td>${fmt(unpaid)}</td>
      <td>${p.date}</td>
      <td>${ob ? `<span class="badge ${ob.cls}">${ob.label}</span>` : `<span class="badge ${badge}">${label}</span>`}</td>
      <td><button class="btn btn-secondary" onclick="deletePayment(${p.id})" style="padding:4px 8px;font-size:12px">삭제</button></td>
    </tr>`
  }).join('')
}

/** 수납 삭제 → 해당 청구 상태 재계산 */
function deletePayment(id) {
  if (!confirm('입금 기록을 삭제하시겠습니까?')) return
  const p = Store.getPayments().find(py => py.id === id)
  if (!p) return
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
    tbody.innerHTML = '<tr><td colspan="4">공지가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = notices.map(n => `
    <tr>
      <td><a href="#" onclick="showNoticeDetail(${n.id});return false" style="color:#1a73e8;text-decoration:none">${n.title}</a></td>
      <td>${n.date}</td>
      <td><span class="badge ${n.sent ? 'badge-paid' : 'badge-pending'}">${n.sent ? '발송완료' : '미발송'}</span></td>
      <td>
        ${n.sent ? '' : `<button class="btn btn-primary" onclick="sendNotice(${n.id})" style="padding:4px 8px;font-size:12px">발송</button>`}
        <button class="btn btn-secondary" onclick="deleteNotice(${n.id})" style="padding:4px 8px;font-size:12px">삭제</button>
      </td>
    </tr>
  `).join('')
}

function renderRecent() {
  const tbody = document.getElementById('recent-tbody')
  const all = [
    ...Store.getBills().map(b => ({ date: b.yearMonth + '-01', text: `청구서 생성 - 세대 ID ${b.unitId}`, status: b.status })),
    ...Store.getPayments().map(p => ({ date: p.date, text: `입금 등록 - ${fmt(p.amount)}`, status: 'paid' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
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

function updateStats() {
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
    return `<tr>
      <td>${u.name}</td>
      <td>${bld ? bld.name : '-'}</td>
      <td>${period}</td>
      <td><span class="badge ${badge}">${label}</span></td>
    </tr>`
  }).join('')
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
  const overlay = document.getElementById('modal-overlay')
  const modal = document.getElementById('modal')
  overlay.classList.remove('hidden')
  modal.style.left = ''
  modal.style.top = ''
  modal.style.transform = 'translate(-50%, -50%)'
  const title = document.getElementById('modal-title')
  const body = document.getElementById('modal-body')
  switch (type) {
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
    case 'bill-detail': {
      title.textContent = '청구 상세 내역'
      const b = editData
      if (!b) { body.innerHTML = '<p>데이터를 찾을 수 없습니다.</p>'; break }
      const unit = Store.getUnits().find(u => u.id === b.unitId)
      const wf = WELFARE[b.welfareType]
      const welfareName = wf ? wf.label : '해당없음'
      const elecDiscount = wf ? wf.elecDiscount : 0
      const waterDiscountPct = wf ? wf.waterDiscountPct : 0
      const hasDiscount = elecDiscount > 0 || waterDiscountPct > 0
      const row = (label, value) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #eee">${label}</td><td style="padding:4px 12px;border-bottom:1px solid #eee;text-align:right">${value}</td></tr>`
      const section = (title) => `<tr><td colspan="2" style="padding:6px 12px;background:#f5f5f5;font-weight:600;font-size:13px">${title}</td></tr>`
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
        ${section('세대 정보')}
        ${row('세대', esc(unit ? unit.name : '알 수 없음'))}
        ${row('청구월', b.yearMonth)}
        ${section('사용량')}
        ${row('전기 사용량', b.elecUsage ? fm(b.elecUsage) + ' kWh' : '0 kWh')}
        ${row('수도 사용량', b.waterUsage ? fm(b.waterUsage) + ' m³' : '0 m³')}
        ${section('복지할인')}
        ${row('적용 대상', welfareName)}
        ${hasDiscount ? (elecDiscount > 0 ? row('전기 할인', '-' + fmt(elecDiscount)) : '') : ''}
        ${hasDiscount ? (waterDiscountPct > 0 ? row('수도 할인율', '-' + Math.round(waterDiscountPct * 100) + '%') : '') : ''}
        ${section('청구 금액')}
        ${row('월세', fmt(b.rent))}
        ${row('관리비', fmt(b.maintenanceFee))}
        ${row('전기요금', fmt(b.electricity))}
        ${row('수도요금', fmt(b.water))}
        ${row('공용관리비', fmt(b.commonFee))}
        ${row('TV수신료', fmt(b.tvFee))}
        ${row('연체료', fmt(b.lateFee))}
        ${row('<strong>합계</strong>', '<strong>' + fmt(b.total) + '</strong>')}
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
  }
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
      const prevMeters = Store.getMeters().filter(m => m.unitId === data.unitId && m.id !== state.editingId).sort((a, b) => a.date.localeCompare(b.date))
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
      }
      if (data.amount <= 0) return alert('납부액을 입력하세요.')
      Store.addPayment(data)
      const totalPaid = Store.getPayments().filter(p => p.billId === billId).reduce((s, p) => s + p.amount, 0)
      if (totalPaid >= bill.total) Store.updateBill(billId, { status: 'paid' })
      else Store.updateBill(billId, { status: 'pending' })
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

/** 검침 삭제 (직접 Store._data 조작) */
function deleteMeter(id) {
  Store._data.meters = Store.getMeters().filter(m => m.id !== id)
  Store.save()
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

/** 청구 생성 — 계약중 세대별 검침 기반 전기/수도 요금 계산 + 복지할인 반영 후 Bill 저장 */
function generateBills() {
  const units = Store.getUnits()
  if (!units.length) return alert('등록된 세대가 없습니다.')
  const ym = new Date().toISOString().slice(0, 7)
  const activeUnits = units.filter(u => Store.getContracts().find(c => c.unitId === u.id && c.status === 'active'))
  if (!activeUnits.length) return alert('계약중인 세대가 없습니다.')
  const missingMeters = activeUnits.filter(u => {
    const meters = Store.getMeters().filter(m => m.unitId === u.id)
    return meters.length < 2
  })
  if (missingMeters.length) {
    showModal('meter-required', { units: missingMeters })
    return
  }
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
  for (const u of activeUnits) {
    const contract = Store.getContracts().find(c => c.unitId === u.id && c.status === 'active')
    const rent = contract ? contract.rent : 0
    const maintenanceFee = contract ? contract.maintenanceFee : 0
    const welfareId = contract ? (contract.welfare || 'none') : 'none'
    const meters = Store.getMeters().filter(m => m.unitId === u.id).sort((a, b) => a.date.localeCompare(b.date))
    const lastMeter = meters[meters.length - 1]
    const prevMeter = meters[meters.length - 2]
    let elecCost = 0, waterCost = 0
    let elecUsage = 0, waterUsage = 0
    if (lastMeter && prevMeter) {
      elecUsage = Math.max(0, lastMeter.electricity - prevMeter.electricity)
      waterUsage = Math.max(0, lastMeter.water - prevMeter.water)
      elecCost = calcElec(elecUsage)
      waterCost = calcWater(waterUsage)
    }
    const wf = WELFARE[welfareId]
    const elecDiscount = wf ? wf.elecDiscount : 0
    const waterDiscountPct = wf ? wf.waterDiscountPct : 0
    const elecAfter = Math.max(0, elecCost - elecDiscount)
    const waterAfter = waterCost * (1 - waterDiscountPct)
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

    const total = rent + maintenanceFee + Math.round(elecAfter) + Math.round(waterAfter) + commonFee + tvFee + late
    Store.addBill({
      unitId: u.id,
      yearMonth: ym,
      rent,
      maintenanceFee,
      electricity: Math.round(elecAfter),
      water: Math.round(waterAfter),
      commonFee,
      tvFee,
      lateFee: late,
      total,
      status: 'unpaid',
      elecUsage,
      waterUsage,
      welfareType: welfareId,
    })
  }
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
  .bill .table-wrap { flex: 1; display: flex; flex-direction: column; }
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
    const hasElecDiscount = wf && wf.elecDiscount > 0
    const hasWaterDiscount = wf && wf.waterDiscountPct > 0
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
        <tr><td>전기요금${hasElecDiscount ? '<span class="welfare-tag"> (복지할인)</span>' : ''}</td><td class="right">${fmt(b.electricity)}</td></tr>
        <tr><td>수도요금${hasWaterDiscount ? '<span class="welfare-tag"> (복지할인)</span>' : ''}</td><td class="right">${fmt(b.water)}</td></tr>
        <tr><td>공용관리비</td><td class="right">${fmt(b.commonFee)}</td></tr>
        <tr><td>TV수신료</td><td class="right">${fmt(b.tvFee)}</td></tr>
        <tr><td>연체료</td><td class="right">${fmt(b.lateFee)}</td></tr>
        <tr><td style="font-weight:700;font-size:9pt">합계</td><td style="font-weight:700;font-size:9pt;text-align:right">${fmt(b.total)}</td></tr>
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

init()
