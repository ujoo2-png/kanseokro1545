const Store = {
  _data: null,

  _key: 'kanseokro1545_data',

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

  save() {
    localStorage.setItem(this._key, JSON.stringify(this._data))
  },

  // Buildings
  getBuildings() { return this._data.buildings },
  addBuilding(b) { this._data.buildings.push({ id: Date.now(), ...b }); this.save() },
  updateBuilding(id, data) {
    const idx = this._data.buildings.findIndex(x => x.id === id)
    if (idx > -1) { this._data.buildings[idx] = { ...this._data.buildings[idx], ...data }; this.save() }
  },
  deleteBuilding(id) {
    this._data.buildings = this._data.buildings.filter(x => x.id !== id)
    this.save()
  },

  // Units
  getUnits() { return this._data.units },
  addUnit(u) { this._data.units.push({ id: Date.now(), ...u }); this.save() },
  updateUnit(id, data) {
    const idx = this._data.units.findIndex(u => u.id === id)
    if (idx > -1) { this._data.units[idx] = { ...this._data.units[idx], ...data }; this.save() }
  },
  deleteUnit(id) {
    this._data.units = this._data.units.filter(u => u.id !== id)
    this._data.meters = this._data.meters.filter(m => m.unitId !== id)
    this._data.bills = this._data.bills.filter(b => b.unitId !== id)
    this._data.payments = this._data.payments.filter(p => p.unitId !== id)
    this._data.contracts = this._data.contracts.filter(c => c.unitId !== id)
    this.save()
  },

  // Contracts
  getContracts() { return this._data.contracts },
  addContract(c) { this._data.contracts.push({ id: Date.now(), ...c }); this.save() },
  updateContract(id, data) {
    const idx = this._data.contracts.findIndex(x => x.id === id)
    if (idx > -1) { this._data.contracts[idx] = { ...this._data.contracts[idx], ...data }; this.save() }
  },
  deleteContract(id) {
    this._data.contracts = this._data.contracts.filter(x => x.id !== id)
    this.save()
  },

  // Meters
  getMeters() { return this._data.meters },
  addMeter(m) { this._data.meters.push({ id: Date.now(), ...m }); this.save() },
  updateMeter(id, data) {
    const idx = this._data.meters.findIndex(m => m.id === id)
    if (idx > -1) { this._data.meters[idx] = { ...this._data.meters[idx], ...data }; this.save() }
  },

  // Bills
  getBills() { return this._data.bills },
  addBill(b) { this._data.bills.push({ id: Date.now(), ...b }); this.save() },
  updateBill(id, data) {
    const idx = this._data.bills.findIndex(b => b.id === id)
    if (idx > -1) { this._data.bills[idx] = { ...this._data.bills[idx], ...data }; this.save() }
  },

  // Payments
  getPayments() { return this._data.payments },
  addPayment(p) { this._data.payments.push({ id: Date.now(), ...p }); this.save() },

  // Notices
  getNotices() { return this._data.notices },
  addNotice(n) { this._data.notices.push({ id: Date.now(), ...n }); this.save() },
  updateNotice(id, data) {
    const idx = this._data.notices.findIndex(n => n.id === id)
    if (idx > -1) { this._data.notices[idx] = { ...this._data.notices[idx], ...data }; this.save() }
  },
}
