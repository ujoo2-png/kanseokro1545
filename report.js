/*
 * report.js — 리포트 및 차트 엔진
 * 간석로1545 관리자 시스템 v1.16.0
 */

const Chart = {
  _opt(opts) {
    return {
      width: opts.width || 400,
      height: opts.height || 240,
      padding: opts.padding || { top: 20, right: 16, bottom: 32, left: 48 },
      barColor: opts.barColor || '#2d5427',
      barColor2: opts.barColor2 || '#e8eaed',
      lineColor: opts.lineColor || '#2d5427',
      lineWidth: opts.lineWidth || 2,
      fillArea: opts.fillArea !== undefined ? opts.fillArea : true,
      colors: opts.colors || ['#2d5427','#e65100','#1565c0','#6a1b9a','#c62828','#283593','#00695c','#f57f17'],
      gridColor: opts.gridColor || '#e8eaed',
      textColor: opts.textColor || '#888',
      fontSize: opts.fontSize || 11,
    }
  },

  _setup(canvasId, opt) {
    const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId
    if (!canvas) return null
    const dpr = window.devicePixelRatio || 1
    canvas.width = opt.width * dpr
    canvas.height = opt.height * dpr
    canvas.style.width = opt.width + 'px'
    canvas.style.height = opt.height + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    return { canvas, ctx, opt }
  },

  _clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h)
  },

  _drawGrid(ctx, p, w, h, maxVal) {
    ctx.strokeStyle = p.gridColor
    ctx.lineWidth = 1
    ctx.font = p.fontSize + 'px sans-serif'
    ctx.fillStyle = p.textColor
    ctx.textAlign = 'right'
    const lines = 4
    for (let i = 0; i <= lines; i++) {
      const val = Math.round((maxVal / lines) * i)
      const y = p.top + (h - p.top - p.bottom) * (1 - i / lines)
      ctx.beginPath()
      ctx.moveTo(p.left, y)
      ctx.lineTo(w - p.right, y)
      ctx.stroke()
      ctx.fillText(fmtShort(val), p.left - 6, y + 4)
    }
  },

  /** 막대 차트 */
  bar(canvasId, labels, values, opts = {}) {
    const p = this._opt(opts)
    const r = this._setup(canvasId, p)
    if (!r) return
    const { ctx } = r
    const { width: w, height: h } = p
    this._clear(ctx, w, h)

    const maxVal = Math.max(...values, 1)
    const chartW = w - p.left - p.right
    const chartH = h - p.top - p.bottom
    const barW = Math.min(40, (chartW / values.length) * 0.6)
    const gap = (chartW - barW * values.length) / (values.length + 1)

    this._drawGrid(ctx, p, w, h, maxVal)

    ctx.textAlign = 'center'
    ctx.fillStyle = p.textColor
    ctx.font = p.fontSize + 'px sans-serif'

    values.forEach((v, i) => {
      const x = p.left + gap + i * (barW + gap)
      const barH = (v / maxVal) * chartH
      const y = p.top + chartH - barH
      ctx.fillStyle = p.barColor
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [3,3,0,0]) : ctx.rect(x, y, barW, barH)
      ctx.fill()
      if (v > 0) {
        ctx.fillStyle = '#333'
        ctx.font = '10px sans-serif'
        ctx.fillText(fmtShort(v), x + barW / 2, y - 4)
      }
      const label = labels[i] || ''
      ctx.fillStyle = p.textColor
      ctx.font = '10px sans-serif'
      ctx.save()
      ctx.translate(x + barW / 2, p.top + chartH + 14)
      ctx.rotate(label.length > 4 ? -0.4 : 0)
      ctx.fillText(label, 0, 0)
      ctx.restore()
    })
  },

  /** 라인 차트 */
  line(canvasId, labels, datasets, opts = {}) {
    const p = this._opt(opts)
    const r = this._setup(canvasId, p)
    if (!r) return
    const { ctx } = r
    const { width: w, height: h } = p
    this._clear(ctx, w, h)

    const allVals = datasets.flatMap(d => d.data)
    const maxVal = Math.max(...allVals, 1)
    const chartW = w - p.left - p.right
    const chartH = h - p.top - p.bottom

    this._drawGrid(ctx, p, w, h, maxVal)

    const stepX = labels.length > 1 ? chartW / (labels.length - 1) : chartW

    datasets.forEach((ds, di) => {
      const color = p.colors[di % p.colors.length]
      ctx.strokeStyle = color
      ctx.lineWidth = p.lineWidth
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ds.data.forEach((v, i) => {
        const x = p.left + (labels.length > 1 ? i * stepX : chartW / 2)
        const y = p.top + chartH - (v / maxVal) * chartH
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      if (p.fillArea) {
        ctx.fillStyle = color + '22'
        ctx.beginPath()
        const firstX = p.left + (labels.length > 1 ? 0 : chartW / 2)
        ctx.moveTo(firstX, p.top + chartH)
        ds.data.forEach((v, i) => {
          const x = p.left + (labels.length > 1 ? i * stepX : chartW / 2)
          const y = p.top + chartH - (v / maxVal) * chartH
          ctx.lineTo(x, y)
        })
        ctx.lineTo(p.left + (labels.length > 1 ? (labels.length - 1) * stepX : chartW / 2), p.top + chartH)
        ctx.closePath()
        ctx.fill()
      }

      ds.data.forEach((v, i) => {
        const x = p.left + (labels.length > 1 ? i * stepX : chartW / 2)
        const y = p.top + chartH - (v / maxVal) * chartH
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.stroke()
        if (v > 0) {
          ctx.fillStyle = '#333'
          ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(fmtShort(v), x, y - 8)
        }
      })
    })

    ctx.textAlign = 'center'
    ctx.fillStyle = p.textColor
    ctx.font = '10px sans-serif'
    labels.forEach((l, i) => {
      const x = p.left + (labels.length > 1 ? i * stepX : chartW / 2)
      ctx.fillText(l, x, p.top + chartH + 16)
    })

    if (datasets.length > 1) {
      let lx = w - p.right - 80
      const ly = p.top + 4
      datasets.forEach((ds, di) => {
        const color = p.colors[di % p.colors.length]
        ctx.fillStyle = color
        ctx.fillRect(lx, ly + di * 16, 10, 10)
        ctx.fillStyle = '#555'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(ds.label || '', lx + 14, ly + di * 16 + 9)
      })
    }
  },

  /** 파이 차트 */
  pie(canvasId, labels, values, opts = {}) {
    const p = this._opt(opts)
    p.padding = { top: 20, right: 120, bottom: 20, left: 20 }
    const r = this._setup(canvasId, p)
    if (!r) return
    const { ctx } = r
    const { width: w, height: h } = p
    this._clear(ctx, w, h)

    const total = values.reduce((s, v) => s + v, 0)
    if (!total) return

    const cx = (w - p.right + p.left) / 2
    const cy = h / 2
    const radius = Math.min(cx - p.left, cy - p.top) - 10

    let startAngle = -Math.PI / 2
    values.forEach((v, i) => {
      const sliceAngle = (v / total) * Math.PI * 2
      ctx.fillStyle = p.colors[i % p.colors.length]
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      const midAngle = startAngle + sliceAngle / 2
      const labelR = radius * 0.6
      const lx = cx + Math.cos(midAngle) * labelR
      const ly = cy + Math.sin(midAngle) * labelR
      if (v > 0) {
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(Math.round(v / total * 100) + '%', lx, ly + 4)
      }

      const legendX = w - p.right + 16
      const legendY = p.top + 20 + i * 22
      ctx.fillStyle = p.colors[i % p.colors.length]
      ctx.fillRect(legendX, legendY - 4, 12, 12)
      ctx.fillStyle = '#555'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText((labels[i] || '') + ' (' + fmtShort(v) + ')', legendX + 18, legendY + 6)

      startAngle += sliceAngle
    })
  },
}

function fmtShort(n) {
  if (n >= 10000) return Math.round(n / 10000) + '만'
  if (n >= 1000) return Math.round(n / 1000) + '천'
  return String(n)
}

/* canvas에 '데이터 없음' 메시지 */
function showNoData(canvasId, message) {
  const cvs = document.getElementById(canvasId)
  if (!cvs) return
  const dpr = window.devicePixelRatio || 1
  const w = cvs.clientWidth || parseInt(cvs.getAttribute('width')) || 400
  const h = cvs.clientHeight || parseInt(cvs.getAttribute('height')) || 200
  cvs.width = w * dpr
  cvs.height = h * dpr
  cvs.style.width = w + 'px'
  cvs.style.height = h + 'px'
  const ctx = cvs.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#bbb'
  ctx.font = '14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(message || '데이터가 없습니다.', w / 2, h / 2)
}

/* 리포트 페이지 렌더링 */
function renderReports() {
  renderArrearsChart()
  renderOverdueTrend()
  renderUnitUsage()
  renderIncomeExpense()
  renderElecTrend()
  renderWaterTrend()
}

/* 월별 미수 현황 (막대) */
function renderArrearsChart() {
  const bills = Store.getBills()
  if (!bills.length) {
    showNoData('chart-arrears', '월별 미수금 데이터가 없습니다.')
    document.getElementById('report-arrears-summary').innerHTML = ''
    return
  }
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
  const sorted = Object.keys(ymMap).sort()
  const labels = sorted.map(ym => ym.slice(2))
  const arrears = sorted.map(ym => Math.max(0, ymMap[ym].total - ymMap[ym].paid))
  Chart.bar('chart-arrears', labels, arrears, {
    width: 500, height: 240, barColor: '#c62828',
    padding: { top: 20, right: 16, bottom: 32, left: 48 },
  })
  document.getElementById('report-arrears-summary').innerHTML =
    `총 미수금: <strong style="color:#c62828">${fmt(arrears.reduce((s,v)=>s+v,0))}</strong>`
}

/* 연체 추이 (라인) — 30일+ / 60일+ */
function renderOverdueTrend() {
  const bills = Store.getBills()
  if (!bills.length) {
    showNoData('chart-overdue-trend', '연체 데이터가 없습니다.')
    return
  }
  const payments = Store.getPayments()
  const ymMap = {}
  bills.forEach(b => {
    if (!ymMap[b.yearMonth]) ymMap[b.yearMonth] = { bills: [] }
    ymMap[b.yearMonth].bills.push(b)
  })
  const sorted = Object.keys(ymMap).sort()
  const labels = sorted.map(ym => ym.slice(2))
  const overdue30 = []
  const overdue60 = []
  sorted.forEach(ym => {
    let o30 = 0, o60 = 0
    ymMap[ym].bills.forEach(b => {
      const paid = payments.filter(p => p.billId === b.id).reduce((s, p) => s + p.amount, 0)
      if (paid >= b.total) return
      const dueDate = b.yearMonth + '-' + String(b.dueDate || 10).padStart(2, '0')
      const days = Math.max(0, Math.floor((new Date() - new Date(dueDate + 'T23:59:59')) / 86400000))
      if (days >= 30) o30 += b.total - paid
      if (days >= 60) o60 += b.total - paid
    })
    overdue30.push(o30)
    overdue60.push(o60)
  })
  Chart.line('chart-overdue-trend', labels, [
    { label: '30일+ 연체', data: overdue30 },
    { label: '60일+ 연체', data: overdue60 },
  ], {
    width: 500, height: 240,
    colors: ['#e65100', '#c62828'],
    padding: { top: 20, right: 100, bottom: 32, left: 48 },
  })
}

/* 세대별 사용량 (막대) — 선택한 세대의 전기/수도 */
function renderUnitUsage() {
  const sel = document.getElementById('report-unit-select')
  if (!sel) return
  const unitId = parseInt(sel.value)
  const meters = Store.getMeters().filter(m => !unitId || m.unitId === unitId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const unitMap = {}
  meters.forEach(m => {
    const ym = _myear(m)
    if (!unitMap[ym]) unitMap[ym] = { elec: 0, water: 0, count: 0 }
    unitMap[ym].elec += m.electricity || 0
    unitMap[ym].water += m.water || 0
    unitMap[ym].count++
  })
  const sorted = Object.keys(unitMap).sort().slice(-12)
  if (!sorted.length) {
    showNoData('chart-unit-usage', '사용량 데이터가 없습니다.')
    return
  }
  const labels = sorted.map(ym => ym.slice(2))
  const elecData = sorted.map(ym => Math.round((unitMap[ym].elec / unitMap[ym].count)))
  const waterData = sorted.map(ym => Math.round((unitMap[ym].water / unitMap[ym].count) * 10) / 10)
  Chart.line('chart-unit-usage', labels, [
    { label: '전기 (kWh)', data: elecData },
    { label: '수도 (m³)', data: waterData },
  ], {
    width: 500, height: 240,
    colors: ['#2d5427', '#1565c0'],
    padding: { top: 20, right: 100, bottom: 32, left: 48 },
  })
}

/* 월별 수입/지출 추이 */
function renderIncomeExpense() {
  const bills = Store.getBills()
  if (!bills.length) {
    showNoData('chart-income-expense', '청구/수납 데이터가 없습니다.')
    return
  }
  const payments = Store.getPayments()
  const ymMap = {}
  bills.forEach(b => {
    if (!ymMap[b.yearMonth]) ymMap[b.yearMonth] = { billed: 0, paid: 0 }
    ymMap[b.yearMonth].billed += b.total || 0
  })
  payments.forEach(p => {
    const b = bills.find(bx => bx.id === p.billId)
    if (b && ymMap[b.yearMonth]) ymMap[b.yearMonth].paid += p.amount || 0
  })
  const sorted = Object.keys(ymMap).sort()
  const labels = sorted.map(ym => ym.slice(2))
  const billed = sorted.map(ym => ymMap[ym].billed)
  const paid = sorted.map(ym => ymMap[ym].paid)
  Chart.line('chart-income-expense', labels, [
    { label: '청구액', data: billed },
    { label: '수납액', data: paid },
  ], {
    width: 500, height: 240,
    colors: ['#e65100', '#2d5427'],
    padding: { top: 20, right: 100, bottom: 32, left: 48 },
  })
}

function _myear(m) { return String(m.date || '').slice(0, 7) }

/* 전기 사용량/요금 추이 */
function renderElecTrend() {
  const sel = document.getElementById('report-elec-unit')
  if (!sel) return
  const unitId = parseInt(sel.value)
  const meters = Store.getMeters().filter(m => !unitId || m.unitId === unitId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const ymMap = {}
  meters.forEach(m => {
    const ym = _myear(m)
    if (!ymMap[ym]) ymMap[ym] = { usage: 0, count: 0 }
    ymMap[ym].usage += m.electricity || 0
    ymMap[ym].count++
  })
  const sorted = Object.keys(ymMap).sort().slice(-12)
  if (!sorted.length) {
    showNoData('chart-elec-usage', '전기 사용량 데이터가 없습니다.')
    showNoData('chart-elec-charge', '전기 요금 데이터가 없습니다.')
    return
  }
  const labels = sorted.map(ym => ym.slice(2))
  const usage = sorted.map(ym => Math.round(ymMap[ym].usage / ymMap[ym].count))
  const charge = usage.map(v => calcElec(v))
  Chart.bar('chart-elec-usage', labels, usage, { width: 500, height: 200, barColor: '#2d5427', padding: { top: 16, right: 16, bottom: 28, left: 44 } })
  Chart.bar('chart-elec-charge', labels, charge, { width: 500, height: 200, barColor: '#e65100', padding: { top: 16, right: 16, bottom: 28, left: 44 } })
}

/* 수도 사용량/요금 추이 */
function renderWaterTrend() {
  const sel = document.getElementById('report-water-unit')
  if (!sel) return
  const unitId = parseInt(sel.value)
  const meters = Store.getMeters().filter(m => !unitId || m.unitId === unitId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const ymMap = {}
  meters.forEach(m => {
    const ym = _myear(m)
    if (!ymMap[ym]) ymMap[ym] = { usage: 0, count: 0 }
    ymMap[ym].usage += m.water || 0
    ymMap[ym].count++
  })
  const sorted = Object.keys(ymMap).sort().slice(-12)
  if (!sorted.length) {
    showNoData('chart-water-usage', '수도 사용량 데이터가 없습니다.')
    showNoData('chart-water-charge', '수도 요금 데이터가 없습니다.')
    return
  }
  const labels = sorted.map(ym => ym.slice(2))
  const usage = sorted.map(ym => Math.round((ymMap[ym].usage / ymMap[ym].count) * 10) / 10)
  const charge = usage.map(v => calcWater(v))
  Chart.bar('chart-water-usage', labels, usage, { width: 500, height: 200, barColor: '#1565c0', padding: { top: 16, right: 16, bottom: 28, left: 44 } })
  Chart.bar('chart-water-charge', labels, charge, { width: 500, height: 200, barColor: '#e65100', padding: { top: 16, right: 16, bottom: 28, left: 44 } })
}

/* 리포트 페이지 초기화 */
function initReportPage() {
  ;['report-unit-select', 'report-elec-unit', 'report-water-unit'].forEach(id => {
    const sel = document.getElementById(id)
    if (!sel) return
    const current = sel.value
    sel.innerHTML = '<option value="">전체 세대</option>'
    Store.getUnits().forEach(u => {
      sel.innerHTML += `<option value="${u.id}" ${u.id === parseInt(current) ? 'selected' : ''}>${esc(u.name)}</option>`
    })
    if (current) sel.value = current
  })
}
