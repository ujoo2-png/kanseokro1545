/* excel.js — 엑셀 업로드/다운로드 (SheetJS) */

function _unitName(id) {
  const u = Store.getUnits().find(x => x.id === id)
  return u ? u.name : '(알 수 없음)'
}
function _buildingName(id) {
  const b = Store.getBuildings().find(x => x.id === id)
  return b ? b.name : '(알 수 없음)'
}
function _excelDownload(filename, sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}

// --- Export ---
function exportBuildings() {
  const list = Store.getBuildings()
  const rows = [['건물명', '주소', '관리자', '연락처', '계좌정보']]
  list.forEach(b => rows.push([b.name, b.address || '', b.manager || '', b.phone || '', b.accountInfo || '']))
  _excelDownload('건물목록.xlsx', { 건물목록: rows })
}

function exportUnits() {
  const list = Store.getUnits()
  const rows = [['세대명', '건물', '평수', '전기', '수도', '냉난방기', 'TV', '냉장고', '세탁기', 'TV거실장', '침대', '옷장']]
  list.forEach(u => rows.push([u.name, _buildingName(u.buildingId), u.area || '', u.elecBillingType === 'individual' ? '개별신고' : '통합청구', u.waterBillingType === 'individual' ? '개별신고' : '통합청구', u.hasAC ? 'O' : '', u.hasTV ? 'O' : '', u.hasFridge ? 'O' : '', u.hasWasher ? 'O' : '', u.hasTVStand ? 'O' : '', u.hasBed ? 'O' : '', u.hasCloset ? 'O' : '']))
  _excelDownload('세대목록.xlsx', { 세대목록: rows })
}

function exportContracts() {
  const list = Store.getContracts()
  const rows = [['세대', '세입자', '연락처', '비상연락처', '비상연락처 관계', '부동산명', '계약시작', '계약종료', '월세', '관리비', '보증금', '은행명', '계좌번호', '입금주', '복지할인', '상태']]
  list.forEach(c => rows.push([_unitName(c.unitId), c.tenantName || '', c.phone || '', c.emergencyPhone || '', c.emergencyRelation || '', c.agencyName || '', c.startDate || '', c.endDate || '', c.rent || 0, c.maintenanceFee || 0, c.deposit || 0, c.bankName || '', c.accountNumber || '', c.accountHolder || '', c.welfareType || '해당없음', c.status || '']))
  _excelDownload('계약목록.xlsx', { 계약목록: rows })
}

function exportMeters() {
  const list = Store.getMeters()
  const rows = [['세대', '검침일', '전기(kWh)', '수도(m³)']]
  list.forEach(m => rows.push([_unitName(m.unitId), m.date || '', m.electricity || 0, m.water || 0]))
  _excelDownload('검침데이터.xlsx', { 검침데이터: rows })
}

function exportBills() {
  const list = Store.getBills()
  const rows = [['세대', '청구월', '월세', '관리비', '전기', '수도', '공용', 'TV수신료', '연체료', '합계', '선수금차감', '납부상태']]
  list.forEach(b => rows.push([_unitName(b.unitId), b.yearMonth || '', b.rent || 0, b.maintenanceFee || 0, b.electricity || 0, b.water || 0, b.common || 0, b.tvFee || 0, b.lateFee || 0, b.total || 0, b.prepaidDeduction || 0, b.status === 'paid' ? '납부완료' : '미납']))
  _excelDownload('청구내역.xlsx', { 청구내역: rows })
}

function exportPayments() {
  const list = Store.getPayments()
  const rows = [['세대', '청구월', '납부액', '납부일', '입금자', '비고']]
  list.forEach(p => {
    const bill = Store.getBills().find(b => b.id === p.billId)
    rows.push([_unitName(p.unitId), bill ? bill.yearMonth : '', p.amount || 0, p.date || '', p.payer || '', p.note || ''])
  })
  _excelDownload('수납내역.xlsx', { 수납내역: rows })
}

// --- Import ---
function importMeters() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xlsx,.xls'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    if (rows.length < 2) { alert('데이터가 없습니다.'); return }
    let count = 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[0]) continue
      const unitName_ = String(row[0]).trim()
      const unit = Store.getUnits().find(u => u.name === unitName_)
      if (!unit) { console.warn('세대를 찾을 수 없음:', unitName_); continue }
      const date = row[1] ? String(row[1]).trim() : new Date().toISOString().slice(0, 10)
      const elec = parseFloat(row[2]) || 0
      const water = parseFloat(row[3]) || 0
      Store.addMeter({ unitId: unit.id, date, electricity: elec, water })
      count++
    }
    alert(`${count}건의 검침 데이터를 가져왔습니다.`)
    renderMeters()
  }
  input.click()
}
