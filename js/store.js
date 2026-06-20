/*
 * store.js — localStorage 기반 데이터 저장소
 * 간석로1545 관리자 시스템 v1.8.0
 * 모든 데이터는 브라우저 localStorage('kanseokro1545_data')에 JSON 직렬화/역직렬화
 */

const Store = {
  _data: null,
  _key: 'kanseokro1545_data',
  _idCounter: Date.now(),

  /** 고유 ID 생성 (Date.now() 중복 방지) */
  _nextId() {
    this._idCounter++
    return this._idCounter
  },

  /** localStorage에서 JSON 로드, 실패 시 초기화 */
  init() {
    const raw = localStorage.getItem(this._key)
    if (raw) {
      try { this._data = JSON.parse(raw) } catch (e) { this._reset() }
    } else {
      this._reset()
    }
    if (!this._data.buildings) this._data.buildings = []
    if (!this._data.contracts) this._data.contracts = []
    if (!this._data.users) this._data.users = []
    if (!this._data.prepaids) this._data.prepaids = []
    if (!this._data.depositDeductions) this._data.depositDeductions = []
    this._fixDuplicateIds()
    this.save()
    return this._data
  },

  /** 중복 ID를 가진 모든 데이터에 새 ID 부여 + 참조(payments.billId) 업데이트 */
  _fixDuplicateIds() {
    const keys = ['bills', 'payments', 'units', 'buildings', 'contracts', 'meters', 'notices', 'prepaids', 'depositDeductions', 'users']
    const renamed = []
    for (const key of keys) {
      const arr = this._data[key]
      if (!arr) continue
      const seen = new Set()
      this._data[key] = arr.map(item => {
        if (seen.has(item.id)) {
          const newId = this._nextId()
          renamed.push({ oldId: item.id, newId, unitId: item.unitId })
          return { ...item, id: newId }
        }
        seen.add(item.id)
        return item
      })
    }
    for (const r of renamed) {
      for (const p of (this._data.payments || [])) {
        if (p.billId === r.oldId && p.unitId === r.unitId) {
          p.billId = r.newId
        }
      }
    }
  },

  /** 모든 데이터를 빈 배열로 초기화 */
  _reset() {
    this._data = {
      users: [],
      buildings: [],
      units: [],
      contracts: [],
      meters: [],
      bills: [],
      payments: [],
      prepaids: [],
      depositDeductions: [],
      notices: [],
    }
    this.save()
  },

  /** 현재 _data를 localStorage에 직렬화 저장 */
  save() {
    localStorage.setItem(this._key, JSON.stringify(this._data))
  },

  // Users (Auth)
  /** @returns {Array} 사용자 목록 */
  getUsers() { return this._data.users || [] },
  /** 사용자 추가 */
  addUser(u) {
    const users = this.getUsers()
    users.push({ id: this._nextId(), createdAt: new Date().toISOString().slice(0, 10), ...u })
    this._data.users = users
    this.save()
  },
  /** 사용자 수정 */
  updateUser(id, data) {
    const idx = this._data.users.findIndex(x => x.id === id)
    if (idx > -1) { this._data.users[idx] = { ...this._data.users[idx], ...data }; this.save() }
  },
  /** 사용자 삭제 */
  deleteUser(id) {
    this._data.users = (this._data.users || []).filter(x => x.id !== id)
    this.save()
  },
  /** username으로 사용자 찾기 */
  findUserByUsername(username) {
    return (this._data.users || []).find(u => u.username === username)
  },
  /** email로 사용자 찾기 */
  findUserByEmail(email) {
    return (this._data.users || []).find(u => u.email === email)
  },
  /** phone으로 사용자 찾기 */
  findUserByPhone(phone) {
    return (this._data.users || []).find(u => u.phone === phone)
  },

  // Buildings
  /** @returns {Array} 건물 목록 */
  getBuildings() { return this._data.buildings },
  /** 건물 추가 (id=Date.now) */
  addBuilding(b) { this._data.buildings.push({ id: this._nextId(), ...b }); this.save() },
  /** 건물 수정 (id 기준 병합) */
  updateBuilding(id, data) {
    const idx = this._data.buildings.findIndex(x => x.id === id)
    if (idx > -1) { this._data.buildings[idx] = { ...this._data.buildings[idx], ...data }; this.save() }
  },
  /** 건물 삭제 (관련 데이터 유지) */
  deleteBuilding(id) {
    this._data.buildings = this._data.buildings.filter(x => x.id !== id)
    this.save()
  },

  // Units
  /** @returns {Array} 세대 목록 */
  getUnits() { return this._data.units },
  /** 세대 추가 */
  addUnit(u) { this._data.units.push({ id: this._nextId(), ...u }); this.save() },
  /** 세대 수정 */
  updateUnit(id, data) {
    const idx = this._data.units.findIndex(u => u.id === id)
    if (idx > -1) { this._data.units[idx] = { ...this._data.units[idx], ...data }; this.save() }
  },
  /** 세대 삭제 + 연결된 검침/청구/수납/계약 모두 제거 */
  deleteUnit(id) {
    this._data.units = this._data.units.filter(u => u.id !== id)
    this._data.meters = this._data.meters.filter(m => m.unitId !== id)
    this._data.bills = this._data.bills.filter(b => b.unitId !== id)
    this._data.payments = this._data.payments.filter(p => p.unitId !== id)
    this._data.prepaids = (this._data.prepaids || []).filter(p => p.unitId !== id)
    this._data.depositDeductions = (this._data.depositDeductions || []).filter(d => d.unitId !== id)
    this._data.contracts = this._data.contracts.filter(c => c.unitId !== id)
    this.save()
  },

  // Contracts
  /** @returns {Array} 계약 목록 */
  getContracts() { return this._data.contracts },
  /** 계약 추가 */
  addContract(c) { this._data.contracts.push({ id: this._nextId(), ...c }); this.save() },
  /** 계약 수정 */
  updateContract(id, data) {
    const idx = this._data.contracts.findIndex(x => x.id === id)
    if (idx > -1) { this._data.contracts[idx] = { ...this._data.contracts[idx], ...data }; this.save() }
  },
  /** 계약 삭제 */
  deleteContract(id) {
    this._data.contracts = this._data.contracts.filter(x => x.id !== id)
    this.save()
  },

  // Meters
  /** @returns {Array} 검침 데이터 목록 */
  getMeters() { return this._data.meters },
  /** 검침 추가 */
  addMeter(m) { this._data.meters.push({ id: this._nextId(), ...m }); this.save() },
  /** 검침 수정 */
  updateMeter(id, data) {
    const idx = this._data.meters.findIndex(m => m.id === id)
    if (idx > -1) { this._data.meters[idx] = { ...this._data.meters[idx], ...data }; this.save() }
  },

  // Bills
  /** @returns {Array} 청구 목록 */
  getBills() { return this._data.bills },
  /** 청구 추가 */
  addBill(b) { this._data.bills.push({ id: this._nextId(), ...b }); this.save() },
  /** 청구 수정 (주로 status 업데이트) */
  updateBill(id, data) {
    const idx = this._data.bills.findIndex(b => b.id === id)
    if (idx > -1) { this._data.bills[idx] = { ...this._data.bills[idx], ...data }; this.save() }
  },

  // Payments
  /** @returns {Array} 수납 목록 */
  getPayments() { return this._data.payments },
  /** 수납 등록 */
  addPayment(p) { this._data.payments.push({ id: this._nextId(), ...p }); this.save() },
  /** 수납 삭제 */
  deletePayment(id) {
    this._data.payments = this._data.payments.filter(p => p.id !== id)
    this.save()
  },
  /**
   * 특정 청구건의 총 납부액 계산
   * @param {number} billId
   * @returns {number}
   */
  getPaidTotal(billId) {
    return this._data.payments.filter(p => p.billId === billId).reduce((s, p) => s + p.amount, 0)
  },
  /**
   * 미납/부분납 청구 목록 (연체일 계산 포함)
   * @param {number} [unitId] - 특정 세대 필터
   * @returns {Array} { bill, paid, unpaid, overdueDays }
   */
  getOverdueBills(unitId) {
    const today = new Date()
    const bills = this._data.bills.filter(b => {
      if (b.status === 'paid') return false
      if (unitId && b.unitId !== unitId) return false
      return true
    })
    return bills.map(b => {
      const paid = this.getPaidTotal(b.id)
      const unpaid = b.total - paid
      const dueDate = b.yearMonth + '-' + String(b.dueDate || 10).padStart(2, '0')
      const due = new Date(dueDate + 'T23:59:59')
      const overdueDays = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)))
      return { bill: b, paid, unpaid, overdueDays }
    }).filter(item => item.unpaid > 0)
  },

  // Prepaids (선수금)
  /** @returns {Array} 선수금 목록 */
  getPrepaids() { return this._data.prepaids || [] },
  /** 선수금 등록 */
  addPrepaid(p) {
    this._data.prepaids.push({ id: this._nextId(), balance: p.amount, createdAt: new Date().toISOString().slice(0, 10), ...p })
    this.save()
  },
  /** 특정 세대 선수금 총 잔액 */
  getPrepaidBalance(unitId) {
    if (!this._data.prepaids) this._data.prepaids = []
    return this._data.prepaids.filter(p => p.unitId === unitId).reduce((s, p) => s + p.balance, 0)
  },
  /** 선수금 차감 (generateBills에서 호출). 차감 후 남은 잔액 반환 */
  deductPrepaid(unitId, amount) {
    let remaining = amount
    const entries = (this._data.prepaids || []).filter(p => p.unitId === unitId && p.balance > 0)
    for (const entry of entries) {
      if (remaining <= 0) break
      const deduct = Math.min(entry.balance, remaining)
      entry.balance -= deduct
      remaining -= deduct
    }
    this.save()
    return remaining
  },
  /** 선수금 삭제 */
  deletePrepaid(id) {
    this._data.prepaids = (this._data.prepaids || []).filter(p => p.id !== id)
    this.save()
  },

  // Deposit Deductions (보증금 차감)
  /** @returns {Array} 보증금 차감 목록 */
  getDepositDeductions() { return this._data.depositDeductions || [] },
  /** 보증금 차감 등록 (payment 생성 포함) */
  addDepositDeduction(d) {
    this._data.depositDeductions.push({ id: this._nextId(), createdAt: new Date().toISOString().slice(0, 10), ...d })
    this.save()
  },
  /** 보증금 차감 내역 삭제 */
  deleteDepositDeduction(id) {
    this._data.depositDeductions = (this._data.depositDeductions || []).filter(d => d.id !== id)
    this.save()
  },

  // Notices
  /** @returns {Array} 공지 목록 */
  getNotices() { return this._data.notices },
  /** 공지 추가 */
  addNotice(n) { this._data.notices.push({ id: this._nextId(), ...n }); this.save() },
  /** 공지 수정 (sent/발송시간) */
  updateNotice(id, data) {
    const idx = this._data.notices.findIndex(n => n.id === id)
    if (idx > -1) { this._data.notices[idx] = { ...this._data.notices[idx], ...data }; this.save() }
  },
}
