/*
 * store.js — localStorage 기반 데이터 저장소
 * 간석로1545 관리자 시스템 v1.6.0
 * 모든 데이터는 브라우저 localStorage('kanseokro1545_data')에 JSON 직렬화/역직렬화
 */

const Store = {
  _data: null,

  _key: 'kanseokro1545_data',

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
    this.save()
    return this._data
  },

  /** 모든 데이터를 빈 배열로 초기화 */
  _reset() {
    this._data = {
      buildings: [],
      units: [],
      contracts: [],
      meters: [],
      bills: [],
      payments: [],
      notices: [],
    }
    this.save()
  },

  /** 현재 _data를 localStorage에 직렬화 저장 */
  save() {
    localStorage.setItem(this._key, JSON.stringify(this._data))
  },

  // Buildings
  /** @returns {Array} 건물 목록 */
  getBuildings() { return this._data.buildings },
  /** 건물 추가 (id=Date.now) */
  addBuilding(b) { this._data.buildings.push({ id: Date.now(), ...b }); this.save() },
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
  addUnit(u) { this._data.units.push({ id: Date.now(), ...u }); this.save() },
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
    this._data.contracts = this._data.contracts.filter(c => c.unitId !== id)
    this.save()
  },

  // Contracts
  /** @returns {Array} 계약 목록 */
  getContracts() { return this._data.contracts },
  /** 계약 추가 */
  addContract(c) { this._data.contracts.push({ id: Date.now(), ...c }); this.save() },
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
  addMeter(m) { this._data.meters.push({ id: Date.now(), ...m }); this.save() },
  /** 검침 수정 */
  updateMeter(id, data) {
    const idx = this._data.meters.findIndex(m => m.id === id)
    if (idx > -1) { this._data.meters[idx] = { ...this._data.meters[idx], ...data }; this.save() }
  },

  // Bills
  /** @returns {Array} 청구 목록 */
  getBills() { return this._data.bills },
  /** 청구 추가 */
  addBill(b) { this._data.bills.push({ id: Date.now(), ...b }); this.save() },
  /** 청구 수정 (주로 status 업데이트) */
  updateBill(id, data) {
    const idx = this._data.bills.findIndex(b => b.id === id)
    if (idx > -1) { this._data.bills[idx] = { ...this._data.bills[idx], ...data }; this.save() }
  },

  // Payments
  /** @returns {Array} 수납 목록 */
  getPayments() { return this._data.payments },
  /** 수납 등록 */
  addPayment(p) { this._data.payments.push({ id: Date.now(), ...p }); this.save() },
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

  // Notices
  /** @returns {Array} 공지 목록 */
  getNotices() { return this._data.notices },
  /** 공지 추가 */
  addNotice(n) { this._data.notices.push({ id: Date.now(), ...n }); this.save() },
  /** 공지 수정 (sent/발송시간) */
  updateNotice(id, data) {
    const idx = this._data.notices.findIndex(n => n.id === id)
    if (idx > -1) { this._data.notices[idx] = { ...this._data.notices[idx], ...data }; this.save() }
  },
}
