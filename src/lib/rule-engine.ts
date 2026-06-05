import { ParseRule, RuleOperation, OrderItem, OrderGroup, ParsedFile } from './types'

export interface RawRow {
  [key: string]: any
  _rowIndex?: number
}

// Auto-detect file type and generate appropriate rule operations
export function autoDetectRule(parsed: ParsedFile): ParseRule {
  const { headers, rows } = parsed
  const ops: RuleOperation[] = []
  const fieldMappings: Record<string, string | null> = {}

  // Find header row index (contains "物品编码" or "序号" or "SKU编码")
  let headerRowIdx = headers.findIndex(h =>
    /物品编码|SKU编码|序号/.test(h)
  )
  if (headerRowIdx > 0) {
    ops.push({ type: 'skipRows', count: headerRowIdx })
  }

  // Detect file structure type
  const firstHeader = headers[0]?.toLowerCase() || ''
  const allHeaders = headers.join('|').toLowerCase()
  const firstRow = rows[0] || {}
  const firstRowVals = Object.values(firstRow)

  // Field mapping detection
  const mappingRules: [string, string, RegExp][] = [
    ['externalCode', '外部编码|配送单号|单据号|调拨单号|订单号', /外部编码|配送单号|单据号|调拨单号|订单号|SKU.*编码/],
    ['storeName', '收货机构|收货门店|调入门店|门店|货主名称', /收货机构|收货门店|调入门店|门店|货主名称/],
    ['receiverName', '收货人|收件人|收货人姓名', /收货人|收件人|收货人姓名/],
    ['receiverPhone', '收货电话|收件人电话|电话', /收货电话|收件人电话|电话/],
    ['receiverAddress', '收货地址|收件人地址', /收货地址|收件人地址/],
    ['skuCode', '物品编码|SKU编码|SKU.*条码|条码', /物品编码|SKU编码|SKU.*条码|条码/],
    ['skuName', '物品名称|SKU名称|货品名称', /物品名称|SKU名称|货品名称/],
    ['skuQuantity', '发货数量|出库数量|订货数量|数量', /发货数量|出库数量|订货数量|数量/],
    ['skuSpec', '规格型号|规格', /规格型号|规格/],
    ['remark', '备注|单据备注', /备注|单据备注/],
  ]

  mappingRules.forEach(([target, _label, pattern]) => {
    const matchedHeader = headers.find(h => pattern.test(h))
    if (matchedHeader) {
      fieldMappings[target] = matchedHeader
    }
  })

  // Auto-detect structure and add specific operations

  // Type 1: Card boundary (调拨单 style)
  if (allHeaders.includes('调入门店') || allHeaders.includes('收货人') && allHeaders.includes('数量')) {
    ops.push({ type: 'cardBoundary', startMarker: '▶' })
  }

  // Type 2: Multi-row item format with numbers in first column (序号 style)
  const hasSequenceNumber = firstRowVals.some(v => /^\d+$/.test(String(v ?? '')))
  if (hasSequenceNumber && allHeaders.includes('物品')) {
    // Already handled by header skip
  }

  // Type 3: Matrix/transpose (门店×SKU style)
  const storeHeaders = headers.filter(h => /门店|店|银泰|金桥|金银潭/.test(h))
  if (storeHeaders.length > 2) {
    ops.push({ type: 'transpose', skuCol: '物品编码', valueCols: storeHeaders })
  }

  // Type 4: Multi-sheet (already handled by parseExcel)
  if (parsed.sheets && parsed.sheets.length > 1) {
    ops.push({ type: 'multiSheet', merge: true })
  }

  // Common: filter empty rows
  ops.push({ type: 'filterEmptyRows' })

  // Footer skip for rows starting with "合计" or "总计"
  const hasTotalRow = rows.slice(-3).some(row => {
    const first = String(Object.values(row)[0] || '').toLowerCase()
    return first.includes('合计') || first.includes('总计')
  })
  if (hasTotalRow) {
    ops.push({ type: 'skipTotalRows' })
  }

  return {
    name: '自动检测规则',
    fileType: 'excel',
    operations: ops,
    fieldMappings,
  }
}

export function applyRule(
  rows: RawRow[],
  headers: string[],
  rule: ParseRule
): { orders: OrderGroup[]; items: OrderItem[] } {
  let data: RawRow[] = rows.map((r, i) => ({ ...r, _rowIndex: i }))

  for (const op of rule.operations) {
    data = applyOperation(data, headers, op, rule.fieldMappings)
  }

  const items = mapToOrderItems(data, rule.fieldMappings)
  const orders = groupIntoOrders(items)

  return { orders, items }
}

function applyOperation(
  rows: RawRow[],
  headers: string[],
  op: RuleOperation,
  mappings: Record<string, string | null>
): RawRow[] {
  switch (op.type) {
    case 'skipRows':
      return rows.slice(op.count)

    case 'headerRow':
      return rows.slice(op.rowIndex + 1)

    case 'footerSkipRows':
      return rows.slice(0, -op.count)

    case 'filterEmptyRows':
      return rows.filter(r => Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== ''))

    case 'skipTotalRows':
      return rows.filter(r => {
        const firstVal = String(Object.values(r)[0] || '').toLowerCase()
        return !firstVal.includes('合计') && !firstVal.includes('总计') && !firstVal.includes('total')
      })

    case 'aggregateBy': {
      const groups: Record<string, RawRow[]> = {}
      rows.forEach(r => {
        const key = String(r[op.keyField] || '')
        if (!groups[key]) groups[key] = []
        groups[key].push(r)
      })
      return Object.values(groups).map(group => {
        const base = { ...group[0] }
        group.slice(1).forEach(row => {
          Object.keys(row).forEach(k => {
            if (row[k] && !base[k]) base[k] = row[k]
          })
        })
        return base
      })
    }

    case 'transpose': {
      const result: RawRow[] = []
      rows.forEach(row => {
        const skuCode = row[op.skuCol]
        if (!skuCode) return
        op.valueCols.forEach((col, idx) => {
          const qty = parseFloat(row[col])
          if (qty > 0) {
            const header = op.valueColHeaders?.[idx] || col
            result.push({
              ...row,
              [mappings.skuCode || 'SKU物品编码']: skuCode,
              [mappings.skuName || 'SKU物品名称']: skuCode,
              [mappings.storeName || '收货门店']: header,
              [mappings.skuQuantity || 'SKU发货数量']: qty,
            })
          }
        })
      })
      return result
    }

    case 'compositeCell': {
      return rows.flatMap(row => {
        const newRows: RawRow[] = []
        Object.keys(row).forEach(key => {
          const val = String(row[key] || '')
          if (val.includes('\n')) {
            const lines = val.split('\n')
            lines.forEach((line, idx) => {
              const match = line.match(new RegExp(op.quantityPattern))
              if (match) {
                newRows.push({
                  ...row,
                  [key]: line,
                  [`${key}_parsed_name`]: line.replace(new RegExp(op.splitPattern), '').trim(),
                  [`${key}_parsed_qty`]: match[1],
                })
              } else if (idx === 0) {
                newRows.push({ ...row, [key]: line })
              }
            })
          }
        })
        return newRows.length > 0 ? newRows : [row]
      })
    }

    case 'regexExtract':
      return rows.map(row => {
        const val = String(row[op.field] || '')
        const match = val.match(new RegExp(op.pattern))
        return {
          ...row,
          [op.field]: match ? (match[op.groupIndex || 1] || val) : val,
        }
      })

    case 'tailExtract': {
      return rows.map(row => {
        let modified = { ...row }
        op.markers.forEach(marker => {
          const mapping = op.mappings[marker]
          if (mapping) {
            Object.keys(row).forEach(key => {
              const val = String(row[key] || '')
              if (val.includes(marker)) {
                const extracted = val.replace(marker, '').trim()
                modified[mapping] = extracted
              }
            })
          }
        })
        return modified
      })
    }

    case 'staticValue':
      return rows.map(row => ({ ...row, [op.field]: op.value }))

    case 'multiSheet':
      return rows

    case 'cardBoundary': {
      // Card boundary: extract cards with meta (store/receiver) + items
      const cards: { meta: RawRow; items: RawRow[] }[] = []
      let currentMeta: RawRow = {}
      let currentItems: RawRow[] = []
      let skipNextHeader = false
      let inCard = false

      rows.forEach(row => {
        const vals = Object.values(row)
        const firstVal = String(vals[0] || '').trim()

        // Card marker
        if (firstVal.includes('▶') || firstVal.includes('调拨记录')) {
          if (inCard && currentItems.length > 0) {
            cards.push({ meta: currentMeta, items: currentItems })
          }
          currentMeta = {}
          currentItems = []
          inCard = true
          skipNextHeader = true
          return
        }

        if (skipNextHeader && firstVal === '物品编码') {
          skipNextHeader = false
          return
        }
        skipNextHeader = false

        if (!inCard) return

        // Meta row
        if (row['调入门店'] !== undefined && row['调入门店'] !== '') {
          currentMeta = { ...row }
          return
        }

        // Item row: SKU code pattern
        if (/^[A-Z][A-Z0-9]+$/.test(firstVal)) {
          currentItems.push({ ...row })
        }
      })

      if (inCard && currentItems.length > 0) {
        cards.push({ meta: currentMeta, items: currentItems })
      }

      // Flatten: expand each card's items with its meta
      const result: RawRow[] = []
      cards.forEach(card => {
        card.items.forEach(item => {
          result.push({ ...card.meta, ...item })
        })
      })

      return result
    }

    default:
      return rows
  }
}

function mapToOrderItems(rows: RawRow[], mappings: Record<string, string | null>): OrderItem[] {
  const reverseMappings: Record<string, string> = {}
  Object.entries(mappings).forEach(([target, source]) => {
    if (source) reverseMappings[source] = target
  })

  return rows.map((row, idx) => {
    const getValue = (field: string) => {
      const sourceCol = Object.entries(mappings).find(([k]) => k === field)?.[1]
      if (sourceCol && row[sourceCol] !== undefined) return row[sourceCol]
      if (row[field] !== undefined) return row[field]
      return undefined
    }

    const safeStr = (val: any) => val !== undefined && val !== null ? String(val) : ''

    return {
      id: `row-${idx}`,
      externalCode: getValue('externalCode') || getValue('外部编码'),
      storeName: getValue('storeName') || getValue('收货门店'),
      receiverName: getValue('receiverName') || getValue('收件人姓名'),
      receiverPhone: getValue('receiverPhone') || getValue('收件人电话'),
      receiverAddress: getValue('receiverAddress') || getValue('收件人地址'),
      skuCode: safeStr(getValue('skuCode') || getValue('SKU物品编码')),
      skuName: safeStr(getValue('skuName') || getValue('SKU物品名称')),
      skuQuantity: parseFloat(safeStr(getValue('skuQuantity') || getValue('SKU发货数量')) || '0') || 0,
      skuSpec: getValue('skuSpec') || getValue('SKU规格型号'),
      remark: getValue('remark') || getValue('备注'),
      _rowIndex: row._rowIndex ?? idx,
    }
  })
}

function groupIntoOrders(items: OrderItem[]): OrderGroup[] {
  const groups: Record<string, OrderGroup> = {}

  items.forEach(item => {
    const key = item.externalCode || `ungrouped-${item._rowIndex}`
    if (!groups[key]) {
      groups[key] = {
        externalCode: item.externalCode,
        storeName: item.storeName,
        receiverName: item.receiverName,
        receiverPhone: item.receiverPhone,
        receiverAddress: item.receiverAddress,
        remark: item.remark,
        items: [],
      }
    }
    groups[key].items.push(item)
  })

  return Object.values(groups)
}

export function validateOrderItems(items: OrderItem[], existingCodes: Set<string> = new Set()): OrderItem[] {
  const codeMap: Record<string, number[]> = {}

  return items.map((item, idx) => {
    const errors: Record<string, string> = {}

    const hasStore = !!item.storeName
    const hasReceiver = !!(item.receiverName && item.receiverPhone && item.receiverAddress)

    if (!hasStore && !hasReceiver) {
      if (!item.storeName) errors.storeName = '收货门店和收件人信息至少填一组'
      if (!item.receiverName) errors.receiverName = '收件人姓名不能为空'
      if (!item.receiverPhone) errors.receiverPhone = '收件人电话不能为空'
      if (!item.receiverAddress) errors.receiverAddress = '收件人地址不能为空'
    }

    if (!item.skuCode) errors.skuCode = 'SKU物品编码不能为空'
    if (!item.skuName) errors.skuName = 'SKU物品名称不能为空'
    if (!item.skuQuantity || item.skuQuantity <= 0) errors.skuQuantity = 'SKU发货数量必须为正数'

    if (item.receiverPhone) {
      const phone = String(item.receiverPhone).replace(/\s/g, '')
      if (!/^(1[3-9]\d{9}|\d{3,4}-?\d{7,8})$/.test(phone)) {
        errors.receiverPhone = '电话格式不正确'
      }
    }

    if (item.externalCode) {
      if (existingCodes.has(item.externalCode)) {
        errors.externalCode = '该外部编码已存在于数据库中'
      }
      if (!codeMap[item.externalCode]) codeMap[item.externalCode] = []
      codeMap[item.externalCode].push(idx)
    }

    return { ...item, _errors: errors }
  }).map((item, idx, arr) => {
    if (item.externalCode && codeMap[item.externalCode]?.length > 1) {
      const duplicates = codeMap[item.externalCode].filter(i => i !== idx)
      return { ...item, _duplicateWith: duplicates }
    }
    return item
  })
}
