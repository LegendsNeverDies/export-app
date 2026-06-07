import {
  ParseRule,
  RuleOperation,
  OrderItem,
  OrderGroup,
  RawRow,
  GROUP_A_FIELDS,
  GROUP_B_FIELDS,
} from './types'

// ============================================================
// 规则引擎核心
// ============================================================

/**
 * 对解析后的行数据应用规则
 */
export function applyRule(
  allSheetsRows: RawRow[],
  headers: string[],
  rule: ParseRule,
  allParsedSheets?: { rows: RawRow[]; headers: string[]; name: string; allRows?: unknown[][] }[]
): { orders: OrderGroup[]; items: OrderItem[] } {
  // Step 0: 多Sheet逐Sheet尾部提取（收集各Sheet的提取值，暂不注入行）
  const multiSheetOp = rule.operations.find(
    (op): op is import('./types').MultiSheetOp => op.type === 'multiSheet'
  )
  const sheetExtractedValues: Record<string, unknown>[] = []
  let perSheetProcessed = false

  if (multiSheetOp?.perSheetTailExtract && allParsedSheets && allParsedSheets.length > 1) {
    perSheetProcessed = true
    for (let si = 0; si < allParsedSheets.length; si++) {
      const sheet = allParsedSheets[si]
      const extracted = applyTailExtract(sheet.rows, {
        type: 'tailExtract',
        rules: multiSheetOp.perSheetTailExtract,
      }, [sheet])
      sheetExtractedValues.push(extracted)
    }
  }

  // Step 1: 数据区域裁剪
  let data = applyDataRegion(allSheetsRows, rule.dataRegion)
  let currentHeaders = [...headers]

  // 保存 headerRow 之前的原始数据（供 headerExtract/tailExtract 搜索）
  let preSliceData: RawRow[] | null = null

  // Step 2: 依次执行操作管道
  for (const op of rule.operations) {
    if (op.type === 'multiSheet') {
      continue
    }
    if (op.type === 'headerRow') {
      if (!preSliceData) preSliceData = [...data]
      const result = applyHeaderRow(data, currentHeaders, op, allParsedSheets)
      data = result.rows
      currentHeaders = result.headers
    } else if (op.type === 'headerExtract') {
      const extracted = applyHeaderExtract(preSliceData || data, op, allParsedSheets)
      if (Object.keys(extracted).length > 0) {
        data = data.map(row => ({ ...extracted, ...row }))
      }
    } else if (op.type === 'tailExtract') {
      const extracted = applyTailExtract(preSliceData || data, op, allParsedSheets)
      if (Object.keys(extracted).length > 0) {
        data = data.map(row => ({ ...row, ...extracted }))
      }
    } else {
      data = applyOperation(data, currentHeaders, op, rule)
    }
  }

  // Step 2.5: 将逐Sheet提取的值注入到各行（基于 _sheetIndex）
  if (sheetExtractedValues.length > 0) {
    // 先过滤尾部信息行：第一列值以 perSheetTailExtract 中 marker 开头的行
    const skipMarkers = multiSheetOp!.perSheetTailExtract!.map(r => r.marker)
    data = data.filter(row => {
      // 过滤空行
      const hasData = Object.entries(row).some(([k, v]) =>
        !k.startsWith('_') && v !== null && v !== undefined && String(v).trim() !== ''
      )
      if (!hasData) return false
      // 过滤尾部信息行：第一列匹配任一 marker
      const firstColVal = Object.values(row).find(
        v => v !== null && v !== undefined && String(v).trim() !== '' && !String(v).startsWith('_') && isNaN(Number(v))
      )
      if (firstColVal) {
        for (const m of skipMarkers) {
          if (String(firstColVal).startsWith(m)) return false
        }
      }
      return true
    })

    // 注入逐Sheet提取的收件人信息
    data = data.map(row => {
      const si = (row._sheetIndex as number) ?? 0
      if (si < sheetExtractedValues.length && sheetExtractedValues[si]) {
        return { ...sheetExtractedValues[si], ...row }
      }
      return row
    })
  }

  // Step 3: 字段映射 + 校验
  const items = mapToOrderItems(data, rule.fieldMappings)

  // Step 4: 分组
  const orders = groupIntoOrders(items)

  return { orders, items }
}

// ---- HeaderRow ----

function applyHeaderRow(
  rows: RawRow[],
  currentHeaders: string[],
  op: import('./types').HeaderRowOp,
  allParsedSheets?: { rows: RawRow[]; headers: string[]; name: string; allRows?: unknown[][] }[]
): { rows: RawRow[]; headers: string[] } {
  // 优先使用 raw 2D 数据重建行（支持多Sheet）
  if (allParsedSheets && allParsedSheets.length > 0 && allParsedSheets[0]?.allRows) {
    // 使用第一个Sheet的表头行作为列名（假设所有Sheet结构相同）
    const firstSheetAllRows = allParsedSheets[0].allRows!
    if (firstSheetAllRows.length > op.rowIndex) {
      const newHeaderRow = firstSheetAllRows[op.rowIndex]
      let newHeaders = newHeaderRow
        ? (newHeaderRow as unknown[]).map(h => String(h ?? '').trim()).filter(h => h !== '')
        : currentHeaders

      const dataStartRow = op.rowIndex + 1

      // 列对齐检测：使用第一个Sheet的第一行数据
      const firstDataRow = firstSheetAllRows[dataStartRow] as unknown[] | undefined
      if (firstDataRow && firstDataRow.length === newHeaders.length) {
        const firstHeaderVal = newHeaders[0] || ''
        const firstDataVal = String(firstDataRow[0] ?? '').trim()
        const isSequenceCol =
          /^\d+$/.test(firstDataVal) &&
          !/序|编|码|号|排|行|ID|id/i.test(firstHeaderVal) &&
          firstDataVal.length <= 4

        if (isSequenceCol) {
          newHeaders = ['序号', ...newHeaders]
        }
      }

      // 遍历所有Sheet的 raw 2D 数据，逐Sheet重建行
      const allNewRows: RawRow[] = []
      for (let si = 0; si < allParsedSheets.length; si++) {
        const sheetAllRows = allParsedSheets[si]?.allRows
        if (!sheetAllRows || sheetAllRows.length <= op.rowIndex) continue

        for (let i = dataStartRow; i < sheetAllRows.length; i++) {
          const rawRow = sheetAllRows[i] as unknown[]
          if (!rawRow) continue
          const obj: RawRow = { _rowIndex: i - dataStartRow, _sheetIndex: si }
          for (let colIdx = 0; colIdx < rawRow.length && colIdx < newHeaders.length; colIdx++) {
            const h = newHeaders[colIdx]
            if (h && rawRow[colIdx] !== null && rawRow[colIdx] !== undefined && String(rawRow[colIdx]).trim() !== '') {
              obj[h] = rawRow[colIdx]
            }
          }
          allNewRows.push(obj)
        }
      }
      return { rows: allNewRows, headers: newHeaders }
    }
    // fall through to object-format path if first sheet doesn't have enough rows
  }

  if (op.rowIndex < rows.length) {
    const headerRowData = rows[op.rowIndex]
    const newHeaders = currentHeaders.map((h, idx) => {
      const val = headerRowData[h]
      return val ? String(val).trim() || h : h
    })

    const newRows = rows.slice(op.rowIndex + 1).map(row => {
      const newObj: RawRow = {}
      currentHeaders.forEach((oldKey, idx) => {
        const newKey = newHeaders[idx]
        if (newKey && row[oldKey] !== undefined) {
          newObj[newKey] = row[oldKey]
        }
      })
      if (row._rowIndex !== undefined) newObj._rowIndex = row._rowIndex
      if (row._sheetIndex !== undefined) newObj._sheetIndex = row._sheetIndex
      return newObj
    })
    return { rows: newRows, headers: newHeaders }
  }

  return { rows: rows.slice(op.rowIndex + 1), headers: currentHeaders }
}

// ---- 数据区域裁剪 ----

function applyDataRegion(rows: RawRow[], region?: ParseRule['dataRegion']): RawRow[] {
  if (!region) return rows
  let data = rows.map((r, i) => ({ ...r, _rowIndex: r._rowIndex ?? i }))
  if (region.skipHeadRows && region.skipHeadRows > 0) data = data.slice(region.skipHeadRows)
  if (region.skipTailRows && region.skipTailRows > 0) data = data.slice(0, -region.skipTailRows)
  if (region.endMarker) {
    const regex = new RegExp(region.endMarker)
    const endIdx = data.findIndex(row => Object.values(row).some(v => regex.test(String(v ?? ''))))
    if (endIdx >= 0) data = data.slice(0, endIdx)
  }
  return data
}

// ---- 操作管道 ----

function applyOperation(
  rows: RawRow[],
  headers: string[],
  op: RuleOperation,
  rule: ParseRule
): RawRow[] {
  switch (op.type) {
    case 'skipRows': return rows.slice(op.count)
    case 'headerRow': return rows
    case 'footerSkipRows': return op.count > 0 ? rows.slice(0, -op.count) : rows
    case 'filterEmptyRows':
      return rows.filter(r => Object.entries(r).some(([k, v]) =>
        k !== '_rowIndex' && k !== '_sheetIndex' && v !== null && v !== undefined && String(v).trim() !== ''
      ))
    case 'skipTotalRows': {
      const regex = new RegExp((op.patterns || ['合计', '总计', 'total', '小计']).join('|'), 'i')
      return rows.filter(r => {
        const firstVal = String(Object.values(r).find(v =>
          v !== null && v !== undefined && String(v).trim() !== '' &&
          !String(v).startsWith('_') && isNaN(Number(v))
        ) || '')
        return !regex.test(firstVal)
      })
    }
    case 'aggregateBy': return applyAggregateBy(rows, op)
    case 'transpose': return applyTranspose(rows, op)
    case 'multiSheet': return rows // handled in Step 0 of applyRule
    case 'cardBoundary': return applyCardBoundary(rows, op)
    case 'compositeCell': return applyCompositeCell(rows, op)
    case 'regexExtract': return applyRegexExtract(rows, op)
    case 'tailExtract': return rows // handled in applyRule
    case 'headerExtract': return rows // handled in applyRule
    case 'staticValue': return rows.map(row => ({ ...row, [op.field]: op.value }))
    case 'cellSplit': return applyCellSplit(rows, op)
    case 'doubleTranspose': return applyDoubleTranspose(rows, op)
    default: return rows
  }
}

// ---- AggregateBy ----

function applyAggregateBy(rows: RawRow[], op: import('./types').AggregateByOp): RawRow[] {
  const groups: Record<string, RawRow[]> = {}
  rows.forEach(r => {
    const key = String(r[op.keyField] ?? '')
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  })
  return Object.values(groups).map(group => {
    const base = { ...group[0] }
    if (op.mergeFields && op.mergeFields.length > 0) {
      op.mergeFields.forEach(field => {
        if (!base[field] || base[field] === '' || base[field] === null || base[field] === undefined) {
          const filled = group.find(r => r[field] !== null && r[field] !== undefined && String(r[field]).trim() !== '')
          if (filled) base[field] = filled[field]
        }
      })
    }
    return base
  })
}

// ---- Transpose ----

function applyTranspose(rows: RawRow[], op: import('./types').TransposeOp): RawRow[] {
  const result: RawRow[] = []
  const minValue = op.minValue ?? 0
  rows.forEach(row => {
    const fixedValues: Record<string, unknown> = {}
    op.fixedCols.forEach(col => { if (row[col] !== undefined) fixedValues[col] = row[col] })
    op.transposeCols.forEach(col => {
      const cellValue = parseFloat(String(row[col] ?? '0'))
      if (cellValue > minValue) {
        result.push({ ...fixedValues, [op.transposedKeyField]: col, [op.transposedValueField]: cellValue })
      }
    })
  })
  return result
}

// ---- CardBoundary ----

interface CardBoundaryCard {
  meta: Record<string, unknown>
  items: RawRow[]
}

function applyCardBoundary(rows: RawRow[], op: import('./types').CardBoundaryOp): RawRow[] {
  const startRegex = new RegExp(op.startMarker)
  const headerRegex = op.cardHeaderMarker ? new RegExp(op.cardHeaderMarker) : null
  const metaPatterns = op.metaRowPatterns.map(p => ({
    regex: new RegExp(p.pattern),
    targetField: p.targetField,
    groupIndex: p.groupIndex ?? 1,
  }))

  const cards: CardBoundaryCard[] = []
  const state: { current: CardBoundaryCard | null; skipHeader: boolean } = { current: null, skipHeader: false }

  rows.forEach(row => {
    const rowText = JSON.stringify(row)
    if (startRegex.test(rowText)) {
      if (state.current && state.current.items.length > 0) cards.push(state.current)
      state.current = { meta: {}, items: [] }
      state.skipHeader = !!headerRegex
      return
    }
    if (!state.current) return
    if (state.skipHeader && headerRegex) {
      const firstVal = String(Object.values(row).find(v => v !== null && v !== undefined && String(v).trim() !== '') || '')
      if (headerRegex.test(firstVal)) { state.skipHeader = false; return }
      state.skipHeader = false
    }
    let isMetaRow = false
    for (const mp of metaPatterns) {
      const match = rowText.match(mp.regex)
      if (match) { state.current.meta[mp.targetField] = match[mp.groupIndex] || match[0]; isMetaRow = true }
    }
    if (!isMetaRow) state.current.items.push({ ...row })
  })

  if (state.current && state.current.items.length > 0) cards.push(state.current)

  const result: RawRow[] = []
  cards.forEach(card => {
    card.items.forEach(item => { result.push({ ...card.meta, ...item }) })
  })
  return result
}

// ---- CompositeCell ----

function applyCompositeCell(rows: RawRow[], op: import('./types').CompositeCellOp): RawRow[] {
  const result: RawRow[] = []
  rows.forEach(row => {
    const cellValue = String(row[op.sourceCol] ?? '')
    if (!cellValue || !cellValue.includes('\n')) { result.push(row); return }
    const lines = cellValue.split('\n').filter(l => l.trim())
    lines.forEach(line => {
      const nameMatch = line.match(new RegExp(op.namePattern))
      const qtyMatch = line.match(new RegExp(op.quantityPattern))
      result.push({
        ...row,
        [op.sourceCol]: nameMatch ? nameMatch[0] : line,
        [op.nameTargetField]: nameMatch ? nameMatch[op.namePattern.includes('(') ? 1 : 0] || nameMatch[0] : line.trim(),
        [op.quantityTargetField]: qtyMatch ? parseFloat(qtyMatch[1] || qtyMatch[0]) : 0,
      })
    })
  })
  return result
}

// ---- RegexExtract ----

function applyRegexExtract(rows: RawRow[], op: import('./types').RegexExtractOp): RawRow[] {
  const regex = new RegExp(op.pattern)
  const groupIndex = op.groupIndex ?? 1
  return rows.map(row => {
    const val = String(row[op.sourceField] ?? '')
    const match = val.match(regex)
    if (match) return { ...row, [op.targetField]: match[groupIndex] || match[0] }
    return row
  })
}

// ---- TailExtract: 从尾部行提取字段 ----

function applyTailExtract(
  rows: RawRow[],
  op: import('./types').TailExtractOp,
  allParsedSheets?: { rows: RawRow[]; headers: string[]; name: string; allRows?: unknown[][] }[]
): Record<string, unknown> {
  const extractedValues: Record<string, unknown> = {}

  // 优先使用 rawAllRows（包含全部行）
  const rawAllRows = allParsedSheets?.[0]?.allRows
  const searchText = rawAllRows
    ? rawAllRows.map(r => (r as unknown[]).filter(c => c !== null && c !== undefined).join(' ')).join('\n')
    : rows.map(r => JSON.stringify(r)).join('\n')

  for (const rule of op.rules) {
    if (rule.extractPattern) {
      const match = searchText.match(new RegExp(rule.extractPattern))
      if (match) {
        extractedValues[rule.targetField] = match[rule.groupIndex ?? 1] || match[0]
      }
    } else {
      const idx = searchText.indexOf(rule.marker)
      if (idx >= 0) {
        const after = searchText.substring(idx + rule.marker.length)
        const val = after.match(/^\s*([^\s\n]+)/)?.[1] || after.substring(0, 200).trim()
        extractedValues[rule.targetField] = val
      }
    }
  }

  return extractedValues
}

// ---- HeaderExtract: 从头部行提取字段 ----

function applyHeaderExtract(
  rows: RawRow[],
  op: import('./types').HeaderExtractOp,
  allParsedSheets?: { rows: RawRow[]; headers: string[]; name: string; allRows?: unknown[][] }[]
): Record<string, unknown> {
  const extractedValues: Record<string, unknown> = {}

  // 优先使用 rawAllRows（包含全部行，包括元数据行）
  const rawAllRows = allParsedSheets?.[0]?.allRows
  const searchText = rawAllRows
    ? rawAllRows.map(r => (r as unknown[]).filter(c => c !== null && c !== undefined).join(' ')).join('\n')
    : rows.map(r => JSON.stringify(r)).join('\n')

  for (const rule of op.rules) {
    if (rule.extractPattern) {
      const match = searchText.match(new RegExp(rule.extractPattern))
      if (match) {
        extractedValues[rule.targetField] = match[rule.groupIndex ?? 1] || match[0]
      }
    } else {
      // 在搜索文本中查找 marker 后面的值
      const idx = searchText.indexOf(rule.marker)
      if (idx >= 0) {
        const after = searchText.substring(idx + rule.marker.length)
        // 取下一个空格或换行前的文本
        const val = after.match(/^\s*([^\s\n]+)/)?.[1] || after.substring(0, 100).trim()
        extractedValues[rule.targetField] = val
      }
    }
  }

  return extractedValues
}

// ---- CellSplit ----

function applyCellSplit(rows: RawRow[], op: import('./types').CellSplitOp): RawRow[] {
  const result: RawRow[] = []
  rows.forEach(row => {
    const cellValue = String(row[op.sourceCol] ?? '')
    if (!cellValue) { result.push(row); return }
    const lines = cellValue.split(op.separator).filter(l => l.trim())
    if (lines.length <= 1) { result.push(row); return }
    lines.forEach(line => {
      const newRow = { ...row }
      for (const lp of op.linePatterns) {
        const match = line.match(new RegExp(lp.pattern))
        if (match) {
          if (match.groups) {
            Object.entries(lp.fieldMappings).forEach(([groupName, targetField]) => {
              if (match.groups![groupName] !== undefined) newRow[targetField] = match.groups![groupName]
            })
          } else {
            Object.entries(lp.fieldMappings).forEach(([groupIdx, targetField]) => {
              const idx = parseInt(groupIdx, 10)
              if (!isNaN(idx) && match[idx] !== undefined) newRow[targetField] = match[idx]
            })
          }
        }
      }
      newRow[op.sourceCol] = line.trim()
      result.push(newRow)
    })
  })
  return result
}

// ---- DoubleTranspose ----

function applyDoubleTranspose(rows: RawRow[], op: import('./types').DoubleTransposeOp): RawRow[] {
  const result: RawRow[] = []
  const colDimStart = op.colDimensionStart
  rows.forEach(row => {
    const rowDimValue = String(row[op.rowDimensionCol] ?? '').trim()
    if (!rowDimValue) return
    const keys = Object.keys(row)
    for (let i = colDimStart; i < keys.length; i++) {
      const colKey = keys[i]
      const cellValue = String(row[colKey] ?? '').trim()
      if (!cellValue) continue
      const colDimValue = colKey
      if (op.valueIsComposite && op.compositeSplitPattern) {
        const parts = cellValue.split(new RegExp(op.compositeSplitPattern)).filter((s: string) => s.trim())
        parts.forEach((part: string) => {
          const newItem: RawRow = { [op.rowTargetField]: rowDimValue, [op.colTargetField]: colDimValue }
          if (op.compositeNamePattern) {
            const nameMatch = part.match(new RegExp(op.compositeNamePattern))
            if (nameMatch) newItem[op.valueTargetField + '_name'] = nameMatch[1] || nameMatch[0]
          }
          if (op.compositeQtyPattern) {
            const qtyMatch = part.match(new RegExp(op.compositeQtyPattern))
            if (qtyMatch) newItem[op.valueTargetField] = parseFloat(qtyMatch[1] || qtyMatch[0])
          }
          Object.keys(row).slice(0, colDimStart).forEach(k => {
            if (k !== op.rowDimensionCol) newItem[k] = row[k]
          })
          result.push(newItem)
        })
      } else {
        const numValue = parseFloat(cellValue)
        if (isNaN(numValue) || numValue <= 0) return
        const newItem: RawRow = { [op.rowTargetField]: rowDimValue, [op.colTargetField]: colDimValue, [op.valueTargetField]: numValue }
        Object.keys(row).slice(0, colDimStart).forEach(k => {
          if (k !== op.rowDimensionCol) newItem[k] = row[k]
        })
        result.push(newItem)
      }
    }
  })
  return result
}

// ---- 字段映射 ----

function mapToOrderItems(rows: RawRow[], mappings: Record<string, string | null>): OrderItem[] {
  return rows.map((row, idx) => {
    const getValue = (targetField: string): unknown => {
      const sourceCol = mappings[targetField]
      if (sourceCol && row[sourceCol] !== undefined) return row[sourceCol]
      if (row[targetField] !== undefined) return row[targetField]
      return undefined
    }
    const safeStr = (val: unknown): string => val !== undefined && val !== null ? String(val) : ''
    return {
      id: `row-${idx}`,
      externalCode: safeStr(getValue('externalCode')) || undefined,
      storeName: safeStr(getValue('storeName')) || undefined,
      receiverName: safeStr(getValue('receiverName')) || undefined,
      receiverPhone: safeStr(getValue('receiverPhone')) || undefined,
      receiverAddress: safeStr(getValue('receiverAddress')) || undefined,
      skuCode: safeStr(getValue('skuCode')),
      skuName: safeStr(getValue('skuName')),
      skuQuantity: parseFloat(safeStr(getValue('skuQuantity')) || '0') || 0,
      skuSpec: safeStr(getValue('skuSpec')) || undefined,
      remark: safeStr(getValue('remark')) || undefined,
      _rowIndex: (row._rowIndex as number) ?? idx,
      _sheetIndex: (row._sheetIndex as number),
    }
  })
}

// ---- 分组 ----

function groupIntoOrders(items: OrderItem[]): OrderGroup[] {
  const groups: Record<string, OrderGroup> = {}
  items.forEach(item => {
    // 分组键：externalCode + storeName + receiverName + receiverPhone
    // 不同收件人信息会产生不同出库单
    const keyParts = [
      item.externalCode || '',
      item.storeName || '',
      item.receiverName || '',
      item.receiverPhone || '',
    ].filter(Boolean)
    const key = keyParts.length > 0
      ? keyParts.join('|')
      : `ungrouped-${item._rowIndex}`
    if (!groups[key]) {
      groups[key] = { externalCode: item.externalCode, storeName: item.storeName, receiverName: item.receiverName, receiverPhone: item.receiverPhone, receiverAddress: item.receiverAddress, remark: item.remark, items: [] }
    }
    groups[key].items.push(item)
  })
  return Object.values(groups)
}

// ============================================================
// 校验
// ============================================================

export function validateOrderItems(items: OrderItem[], existingCodes: Set<string> = new Set()): OrderItem[] {
  const codeMap: Record<string, number[]> = {}
  return items
    .map((item, idx) => {
      const errors: Record<string, string> = {}
      const hasGroupA = GROUP_A_FIELDS.some(f => item[f as keyof OrderItem])
      const hasGroupB = GROUP_B_FIELDS.every(f => item[f as keyof OrderItem])
      if (!hasGroupA && !hasGroupB) {
        const hasPartialB = GROUP_B_FIELDS.some(f => item[f as keyof OrderItem])
        if (hasPartialB) {
          if (!item.receiverName) errors.receiverName = '收件人姓名不能为空'
          if (!item.receiverPhone) errors.receiverPhone = '收件人电话不能为空'
          if (!item.receiverAddress) errors.receiverAddress = '收件人地址不能为空'
        } else {
          errors.storeName = '收货门店和收件人信息至少填一组'
        }
      }
      if (!item.skuCode) errors.skuCode = 'SKU物品编码不能为空'
      if (!item.skuName) errors.skuName = 'SKU物品名称不能为空'
      if (!item.skuQuantity || item.skuQuantity <= 0) errors.skuQuantity = 'SKU发货数量必须为正数'
      if (item.receiverPhone) {
        const phone = String(item.receiverPhone).replace(/\s/g, '')
        if (!/^(1[3-9]\d{9}|\d{3,4}-?\d{7,8})$/.test(phone)) errors.receiverPhone = '电话格式不正确'
      }
      if (item.externalCode) {
        if (existingCodes.has(item.externalCode)) errors.externalCode = '该外部编码已存在于数据库中'
        if (!codeMap[item.externalCode]) codeMap[item.externalCode] = []
        codeMap[item.externalCode].push(idx)
      }
      return { ...item, _errors: errors }
    })
    .map((item, idx, arr) => {
      if (item.externalCode && codeMap[item.externalCode]?.length > 1) {
        return { ...item, _duplicateWith: codeMap[item.externalCode].filter(i => i !== idx) }
      }
      return item
    })
}
