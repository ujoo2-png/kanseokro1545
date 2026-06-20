let state = { currentModal: null, editingId: null }

function init() {
  Store.init()
  setupNavigation()
  setupDraggableModal()
  setupSidebar()
  renderAll()
  updateStats()
}

/* Sidebar toggle */
function setupSidebar() {
  const saved = localStorage.getItem('kanseokro1545_sidebar')
  if (saved === 'collapsed') document.getElementById('app').classList.add('sidebar-collapsed')
}

function toggleSidebar() {
  const app = document.getElementById('app')
  app.classList.toggle('sidebar-collapsed')
  localStorage.setItem('kanseokro1545_sidebar', app.classList.contains('sidebar-collapsed') ? 'collapsed' : '')
}

/* Navigation */
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
    })
  })
}

/* Building page tabs */
function switchBuildingTab(tabId) {
  document.querySelectorAll('#page-building .tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#page-building .tab-content').forEach(c => c.classList.remove('active'))
  document.querySelector(`#page-building .tab[data-tab="${tabId}"]`).classList.add('active')
  document.getElementById(tabId).classList.add('active')
}

/* Render */
function renderAll() {
  renderBuildings()
  renderUnits()
  renderContracts()
  renderMeters()
  renderBills()
  renderPayments()
  renderNotices()
  renderRecent()
  renderDashboardContracts()
}

function renderBuildings() {
  const tbody = document.getElementById('building-tbody')
  const list = Store.getBuildings()
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">등록된 건물이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td>${b.name}</td>
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
    return `<tr>
      <td>${u.name}</td>
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
    tbody.innerHTML = '<tr><td colspan="15">등록된 계약이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = contracts.map(c => {
    const unit = Store.getUnits().find(u => u.id === c.unitId)
    const badge = c.status === 'active' ? 'badge-paid' : 'badge-unpaid'
    const label = c.status === 'active' ? '진행중' : '종료'
    const activeClass = c.status === 'active' ? 'row-active' : ''
    return `<tr class="${activeClass}">
      <td>${unit ? unit.name : '알 수 없음'}</td>
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
  const meters = Store.getMeters()
  if (!meters.length) {
    tbody.innerHTML = '<tr><td colspan="5">검침 데이터가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = meters.map(m => {
    const unit = Store.getUnits().find(u => u.id === m.unitId)
    return `<tr>
      <td>${unit ? unit.name : '알 수 없음'}</td>
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

function renderBills() {
  const tbody = document.getElementById('billing-tbody')
  const bills = Store.getBills()
  if (!bills.length) {
    tbody.innerHTML = '<tr><td colspan="10">청구 내역이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = bills.map(b => {
    const unit = Store.getUnits().find(u => u.id === b.unitId)
    const badge = b.status === 'paid' ? 'badge-paid' : b.status === 'unpaid' ? 'badge-unpaid' : 'badge-pending'
    const label = b.status === 'paid' ? '납부완료' : b.status === 'unpaid' ? '미납' : '대기'
    return `<tr>
      <td>${unit ? unit.name : '알 수 없음'}</td>
      <td>${b.yearMonth}</td>
      <td>${fmt(b.rent)}</td>
      <td>${fmt(b.maintenanceFee)}</td>
      <td>${fmt(b.electricity)}</td>
      <td>${fmt(b.water)}</td>
      <td>${fmt(b.commonFee)}</td>
      <td>${fmt(b.lateFee)}</td>
      <td>${fmt(b.total)}</td>
      <td><span class="badge ${badge}">${label}</span></td>
    </tr>`
  }).join('')
}

function renderPayments() {
  const tbody = document.getElementById('payment-tbody')
  const payments = Store.getPayments()
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="7">수납 내역이 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = payments.map(p => {
    const unit = Store.getUnits().find(u => u.id === p.unitId)
    const bill = Store.getBills().find(b => b.id === p.billId)
    const unpaid = bill ? bill.total - p.amount : 0
    const badge = unpaid <= 0 ? 'badge-paid' : unpaid >= bill.total ? 'badge-unpaid' : 'badge-pending'
    const label = unpaid <= 0 ? '완납' : unpaid >= bill.total ? '미납' : '부분납'
    return `<tr>
      <td>${unit ? unit.name : '알 수 없음'}</td>
      <td>${bill ? bill.yearMonth : '-'}</td>
      <td>${fmt(bill ? bill.total : 0)}</td>
      <td>${fmt(p.amount)}</td>
      <td>${fmt(unpaid)}</td>
      <td>${p.date}</td>
      <td><span class="badge ${badge}">${label}</span></td>
    </tr>`
  }).join('')
}

function renderNotices() {
  const tbody = document.getElementById('notice-tbody')
  const notices = Store.getNotices()
  if (!notices.length) {
    tbody.innerHTML = '<tr><td colspan="4">공지가 없습니다.</td></tr>'
    return
  }
  tbody.innerHTML = notices.map(n => `
    <tr>
      <td>${n.title}</td>
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
}

/* Dashboard - contract status */
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

/* Modal */
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
      const isEdit = !!editData
      title.textContent = isEdit ? '검침 수정' : '검침 입력'
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-unit">${
          units.map(u => `<option value="${u.id}" ${editData && editData.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')
        }</select></div>
        <div class="form-group"><label>검침일</label><input id="f-date" type="date" value="${editData ? editData.date : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>전기 (kWh)</label><input id="f-elec" type="number" step="0.1" value="${editData ? editData.electricity : ''}"></div>
        <div class="form-group"><label>수도 (m³)</label><input id="f-water" type="number" step="0.1" value="${editData ? editData.water : ''}"></div>
      `
      break
    }
    case 'payment': {
      const units = Store.getUnits()
      const bills = Store.getBills().filter(b => b.status !== 'paid')
      title.textContent = '입금 등록'
      body.innerHTML = `
        <div class="form-group"><label>세대</label><select id="f-punit">${
          units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')
        }</select></div>
        <div class="form-group"><label>청구건</label><select id="f-pbill"></select></div>
        <div class="form-group"><label>납부액</label><input id="f-pamount" type="text" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')"></div>
        <div class="form-group"><label>납부일</label><input id="f-pdate" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      `
      const updateBillOptions = () => {
        const uid = parseInt(document.getElementById('f-punit').value)
        const sel = document.getElementById('f-pbill')
        const filtered = Store.getBills().filter(b => b.unitId === uid && b.status !== 'paid')
        sel.innerHTML = filtered.map(b => `<option value="${b.id}">${b.yearMonth} - ${fmt(b.total)}원</option>`).join('')
      }
      document.getElementById('f-punit').addEventListener('change', updateBillOptions)
      setTimeout(updateBillOptions, 0)
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

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) {
    const overlay = document.getElementById('modal-overlay')
    if (e.target === overlay) { overlay.classList.add('hidden'); return }
    if (!overlay.classList.contains('hidden')) return
  }
  document.getElementById('modal-overlay').classList.add('hidden')
}

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
      if (state.editingId) Store.updateMeter(state.editingId, data)
      else Store.addMeter(data)
      break
    }
    case 'payment': {
      const billId = parseInt(document.getElementById('f-pbill').value)
      const bill = Store.getBills().find(b => b.id === billId)
      if (!bill) return alert('청구건을 선택하세요.')
      const data = {
        unitId: parseInt(document.getElementById('f-punit').value),
        billId,
        amount: parseInt(document.getElementById('f-pamount').value.replace(/,/g, '')) || 0,
        date: document.getElementById('f-pdate').value,
      }
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

function deleteContract(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return
  Store.deleteContract(id)
  renderAll()
}

function deleteMeter(id) {
  Store._data.meters = Store.getMeters().filter(m => m.id !== id)
  Store.save()
  renderAll()
}

function sendNotice(id) {
  if (!confirm('공지를 전체 세대에 발송하시겠습니까?')) return
  Store.updateNotice(id, { sent: true, sentAt: new Date().toISOString() })
  renderAll()
  alert('공지가 발송되었습니다.')
}

function deleteNotice(id) {
  Store._data.notices = Store.getNotices().filter(n => n.id !== id)
  Store.save()
  renderAll()
}

function generateBills() {
  const units = Store.getUnits()
  if (!units.length) return alert('등록된 세대가 없습니다.')
  const ym = new Date().toISOString().slice(0, 7)
  const existing = Store.getBills().filter(b => b.yearMonth === ym)
  if (existing.length) {
    if (!confirm(`${ym} 청구가 이미 ${existing.length}건 있습니다. 다시 생성하시겠습니까?`)) return
  }
  const commonInput = prompt('세대당 공용관리비를 입력하세요 (원, 0이면 미부과):', '0')
  if (commonInput === null) return
  const commonFeePerUnit = parseInt(commonInput) || 0
  for (const u of units) {
    if (Store.getBills().find(b => b.unitId === u.id && b.yearMonth === ym)) continue
    const contract = Store.getContracts().find(c => c.unitId === u.id && c.status === 'active')
    const rent = contract ? contract.rent : (u.rent || 0)
    const maintenanceFee = contract ? contract.maintenanceFee : (u.maintenanceFee || 0)
    const meters = Store.getMeters().filter(m => m.unitId === u.id)
    const lastMeter = meters[meters.length - 1]
    const prevMeter = meters[meters.length - 2]
    let elecCost = 0, waterCost = 0
    if (lastMeter && prevMeter) {
      const elecUsage = Math.max(0, lastMeter.electricity - prevMeter.electricity)
      const waterUsage = Math.max(0, lastMeter.water - prevMeter.water)
      elecCost = Math.round(elecUsage * 120)
      waterCost = Math.round(waterUsage * 800)
    }
    const late = 0
    const commonFee = commonFeePerUnit
    const total = rent + maintenanceFee + elecCost + waterCost + commonFee + late
    Store.addBill({
      unitId: u.id,
      yearMonth: ym,
      rent,
      maintenanceFee,
      electricity: elecCost,
      water: waterCost,
      commonFee,
      lateFee: late,
      total,
      status: 'unpaid',
    })
  }
  renderAll()
  updateStats()
  alert(`${ym} 청구서가 생성되었습니다.`)
}

/* Util */
function fmt(n) {
  return (n || 0).toLocaleString() + '원'
}

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

function yn(v) {
  return v ? '<span class="badge badge-paid">유</span>' : '<span class="badge badge-pending">무</span>'
}

function fm(n) {
  return (n || 0).toLocaleString()
}

init()
