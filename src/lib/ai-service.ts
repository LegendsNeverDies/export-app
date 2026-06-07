import { ParseRule } from './types'

/**
 * AI 分析文件结构并生成解析规则
 * API Key 由前端页面配置传入
 */
export async function analyzeFileWithAI(params: {
  fileName: string
  headers: string[]
  sampleRows: Record<string, unknown>[]
  headRows?: Record<string, unknown>[]
  tailRows?: Record<string, unknown>[]
  sheetNames?: string[]
  totalRows?: number
  pdfFullText?: string
  /** 原始 2D 数组数据（优先使用，让 AI 看到真实行结构） */
  rawAllRows?: unknown[][]
  /** 多Sheet文件的原始数据（按Sheet分组） */
  rawAllSheets?: Array<{ name: string; allRows: unknown[][] }>
  /** DeepSeek API Key（由前端页面配置传入） */
  apiKey: string
}): Promise<{ rule: ParseRule; explanation: string }> {
  const apiKey = params.apiKey
  if (!apiKey) {
    throw new Error('未提供 DeepSeek API Key，请在设置中配置')
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(params)

  // 调用 DeepSeek API（带重试）
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 6000,
        }),
        signal: AbortSignal.timeout(60000), // 60秒超时
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`AI API 错误 (${response.status}): ${err}`)
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content || ''

      return parseAIResponse(content)
    } catch (err: any) {
      lastError = err
      if (err.name === 'TimeoutError' || err.message?.includes('abort')) {
        throw new Error('AI 分析超时，请稍后重试')
      }
      continue
    }
  }

  throw lastError || new Error('AI 分析失败')
}

/**
 * 解析 AI 返回的 JSON 内容
 */
function parseAIResponse(content: string): { rule: ParseRule; explanation: string } {
  // 提取 JSON（可能被 markdown 代码块包裹）
  let jsonStr = content
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1]
  }

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回格式不正确：未找到 JSON')

  try {
    const parsed = JSON.parse(jsonMatch[0])

    const rule = parsed.rule || parsed
    if (!rule.operations || !Array.isArray(rule.operations)) {
      throw new Error('AI 返回的规则缺少 operations 字段')
    }
    if (!rule.fieldMappings || typeof rule.fieldMappings !== 'object') {
      throw new Error('AI 返回的规则缺少 fieldMappings 字段')
    }

    return {
      rule: {
        name: rule.name || 'AI 生成规则',
        description: rule.description,
        fileType: rule.fileType || 'excel',
        dataRegion: rule.dataRegion,
        operations: rule.operations,
        fieldMappings: rule.fieldMappings,
        fieldConfidence: rule.fieldConfidence || {},
      } as ParseRule,
      explanation: parsed.explanation || rule.explanation || '',
    }
  } catch (err: any) {
    throw new Error(`AI 返回的 JSON 解析失败: ${err.message}`)
  }
}

/**
 * 构建 System Prompt
 */
function buildSystemPrompt(): string {
  return `你是一个专业的物流订单文件解析规则生成助手。你的任务是分析文件结构，生成严格符合以下 DSL Schema 的解析规则 JSON。

## 输入数据说明
你将收到文件的原始行数据，每行是一个数组，数组索引对应列位置。你需要：
1. 识别哪一行是真正的表头行（包含列名的行）
2. 识别数据区域（表头行之后到合计/尾部信息之前的行）
3. 识别文件头部和尾部的散落信息（如收货人、单据号等）

## 预置规则参考
以下是常见文件格式的参考规则，你可以在生成规则时借鉴这些模式：

【配送发货单（42列标准格式）】
- 特征：标题含"配送发货单"，表头在第4行（0-based索引3），42列
- 表头行典型列名：序号、物品分类、物品编码、物品名称、规格型号、订货单位、发货数量、发货仓库
- 布局：Row1=标题，Row2=机构信息（收货/供货/订货机构），Row3=状态信息，Row4=表头，Row5+=数据
- 收货人信息在文件尾部，需要用 tailExtract 提取
- 操作：skipRows(4) → filterEmptyRows → skipTotalRows(['合计'])

【多门店分Sheet出库单】
- 特征：每个Sheet对应一个门店，Sheet名=门店名
- 底部包含收货人信息（收货门店、联系人、联系电话、收货地址）
- 必须使用 multiSheet + perSheetTailExtract
- 表头在第4行（0-based索引3）

【库存查询单】
- 特征：标题含"查询结果"，含多门店分货列（门店名为列维度）
- 无合计行，数据直接跟表头
- 可能含公式列（如"下单后结余"）

【汇总单发货明细】
- 特征：含"汇总单发货明细"，32列，含物品行号
- 必填字段带*标记（如"配送单号*"）
- 支持多批次拆行

【门店调拨单（卡片式）】
- 特征：含"调拨记录 #N"标识，卡片式布局
- 每个卡片包含：调入门店、收货人、电话、收货地址 + 物品列表
- 使用 cardBoundary 识别卡片边界

【配送发货单（PDF）】
- 特征：PDF格式，含分页信息"第N页 / 共M页"
- 基本信息在开头，物品表头在中上部
- 合计行和收货人信息在最后一页
- 使用 headerExtract 提取开头信息

## 可用操作类型（operations 数组中的元素）

1. skipRows: { type: "skipRows", count: number } — 跳过前 N 行
2. headerRow: { type: "headerRow", rowIndex: number } — 表头行索引（0-based），该行之后为数据。此操作会以指定行的列名重新映射数据
3. footerSkipRows: { type: "footerSkipRows", count: number } — 跳过尾部 N 行
4. filterEmptyRows: { type: "filterEmptyRows" } — 过滤空行
5. skipTotalRows: { type: "skipTotalRows", patterns?: string[] } — 跳过合计行
6. aggregateBy: { type: "aggregateBy", keyField: string, mergeStrategy?: "first"|"concat", mergeFields?: string[] } — 按字段聚合，mergeFields 指定需从组内非空行填充的字段
7. transpose: { type: "transpose", fixedCols: string[], transposeCols: string[], transposedKeyField: string, transposedValueField: string, minValue?: number } — 矩阵转置，fixedCols 保留列，transposeCols 转置为行
8. multiSheet: { type: "multiSheet", perSheetTailExtract?: TailExtractRule[] } — 多 Sheet 合并
9. cardBoundary: { type: "cardBoundary", startMarker: string, metaRowPatterns: Array<{pattern:string, targetField:string, groupIndex?:number}>, cardHeaderMarker?: string } — 卡片边界识别
10. compositeCell: { type: "compositeCell", sourceCol: string, splitPattern: string, namePattern: string, quantityPattern: string, nameTargetField: string, quantityTargetField: string } — 复合单元格拆分
11. regexExtract: { type: "regexExtract", sourceField: string, pattern: string, targetField: string, groupIndex?: number, searchScope?: "all"|"header"|"footer"|"data" } — 正则提取
12. tailExtract: { type: "tailExtract", rules: Array<{marker:string, targetField:string, extractPattern?:string, groupIndex?:number, searchFromBottom?:number}>, applyScope?: "all"|"group" } — 尾部信息提取
13. headerExtract: { type: "headerExtract", rules: Array<{marker:string, targetField:string, extractPattern?:string, groupIndex?:number, searchFromTop?:number}> } — 头部信息提取
14. staticValue: { type: "staticValue", field: string, value: string } — 静态值填充
15. cellSplit: { type: "cellSplit", sourceCol: string, separator: string, linePatterns: Array<{pattern:string, fieldMappings: Record<string,string>}> } — 单元格拆分
16. doubleTranspose: { type: "doubleTranspose", rowDimensionCol: string, colDimensionStart: number, colDimensionHeaderRow: number, rowTargetField: string, colTargetField: string, valueTargetField: string, valueIsComposite?: boolean, compositeSplitPattern?: string, compositeNamePattern?: string, compositeQtyPattern?: string } — 双重转置

## 字段映射目标字段（fieldMappings 的 key）
- externalCode: 外部编码/配送单号/单据号
- storeName: 收货门店/收货机构/调入门店
- receiverName: 收件人姓名
- receiverPhone: 收件人电话
- receiverAddress: 收件人地址
- skuCode: SKU物品编码/条码
- skuName: SKU物品名称
- skuQuantity: SKU发货数量
- skuSpec: SKU规格型号
- remark: 备注

## 字段置信度标注（fieldConfidence）
- high: 列名精确匹配标准字段名
- medium: 列名语义相近但不完全一致
- low: 根据数据特征推断，可能存在偏差

## 返回格式
{
  "rule": {
    "name": "规则名称（体现文件特征）",
    "description": "规则说明",
    "fileType": "excel" 或 "pdf",
    "dataRegion": { ... },
    "operations": [ ... ],
    "fieldMappings": { "目标字段": "源列名", ... },
    "fieldConfidence": { "目标字段": "high/medium/low", ... }
  },
  "explanation": "规则说明，包括对低置信度映射的特别说明和操作选择的理由"
}

## 重要规则
1. headerRow 的 rowIndex 必须指向真正的表头行（0-based），数据从该行之后开始
2. fieldMappings 中的源列名必须来自表头行的实际列名
3. 如果收货人/电话/地址信息出现在文件尾部而非数据列中，使用 tailExtract
4. 如果文件是门店×SKU矩阵格式（门店名在列头），使用 transpose
5. 如果文件包含多个以分隔符区分的"卡片"，使用 cardBoundary
6. 如果同一配送单号下有多行SKU，使用 aggregateBy 填充缺失字段
7. 如果是多 Sheet 文件，使用 multiSheet
8. 每个字段映射必须标注置信度
9. 只返回 JSON，不要包含其他解释文字

## 多Sheet文件处理规则（重要）
1. 如果文件包含多个Sheet，每个Sheet通常是独立的出库单/门店
2. 每个Sheet底部通常包含该Sheet独有的收货人信息（收货人姓名、电话、地址）
3. 多Sheet文件必须使用 multiSheet + perSheetTailExtract 组合：
   - operations 中第一项应为：
     { "type": "multiSheet", "perSheetTailExtract": [
       { "marker": "收货人：", "targetField": "receiverName" },
       { "marker": "电话：", "targetField": "receiverPhone" },
       { "marker": "地址：", "targetField": "receiverAddress" }
     ]}
   - perSheetTailExtract 内的 rules 结构与 tailExtract 完全相同
   - 不要同时使用 multiSheet 和单独的 tailExtract 操作
4. 每个Sheet的数据区结构相同时，headerRow 等操作在 multiSheet 之后统一处理
5. 不要将收货人信息映射为 fieldMappings 的源列名（因为它们在尾部不在数据列中）
6. 注意区分"多Sheet共享尾部信息"和"每Sheet独立尾部信息"——多门店出库单通常是后者`
}

/**
 * 构建 User Prompt
 * 优先使用原始 2D 数组（allRows），让 AI 看到真实行结构
 */
function buildUserPrompt(params: {
  fileName: string
  headers: string[]
  sampleRows: Record<string, unknown>[]
  headRows?: Record<string, unknown>[]
  tailRows?: Record<string, unknown>[]
  sheetNames?: string[]
  totalRows?: number
  pdfFullText?: string
  rawAllRows?: unknown[][]
  rawAllSheets?: Array<{ name: string; allRows: unknown[][] }>
}): string {
  const parts: string[] = []

  parts.push(`文件名：${params.fileName}`)
  parts.push(`总行数：${params.totalRows || '未知'}`)

  if (params.sheetNames && params.sheetNames.length > 0) {
    parts.push(`Sheet 列表：${params.sheetNames.join(', ')}`)
  }

  if (params.pdfFullText) {
    parts.push(`\n## PDF 全文内容\n${params.pdfFullText.substring(0, 3000)}`)
  } else if (params.rawAllSheets && params.rawAllSheets.length > 1) {
    // 多Sheet文件：对每个Sheet独立展示头部和尾部数据
    const maxSheetsToShow = Math.min(params.rawAllSheets.length, 4)
    parts.push(`\n## 多Sheet文件结构（共 ${params.rawAllSheets.length} 个Sheet，以下展示前 ${maxSheetsToShow} 个）`)
    parts.push(`每个Sheet是一个独立的出库单，底部包含该Sheet的收货人信息。\n`)

    for (let si = 0; si < maxSheetsToShow; si++) {
      const sheet = params.rawAllSheets[si]
      const { name, allRows } = sheet
      const maxCols = 15
      const headCount = Math.min(allRows.length, 8)
      const tailCount = Math.min(allRows.length, 5)

      parts.push(`\n### ${name}`)
      // 头部行
      parts.push(`(前${headCount}行)`)
      for (let i = 0; i < headCount; i++) {
        const row = allRows[i]
        if (!row) continue
        const trimmed = row.slice(0, maxCols).map((v: unknown) =>
          v === null || v === undefined ? '' : String(v).trim()
        )
        if (trimmed.some(v => v !== '')) {
          parts.push(`  [${i}] ${JSON.stringify(trimmed)}`)
        }
      }
      // 尾部行（不同Sheet尾部收件人信息不同，很重要）
      if (allRows.length > headCount) {
        parts.push(`(尾部${tailCount}行 - 包含收货人信息)`)
        const tailStart = Math.max(headCount, allRows.length - tailCount)
        for (let i = tailStart; i < allRows.length; i++) {
          const row = allRows[i]
          if (!row) continue
          const trimmed = row.slice(0, maxCols).map((v: unknown) =>
            v === null || v === undefined ? '' : String(v).trim()
          )
          if (trimmed.some(v => v !== '')) {
            parts.push(`  [${i}] ${JSON.stringify(trimmed)}`)
          }
        }
      }
    }
  } else if (params.rawAllRows && params.rawAllRows.length > 0) {
    // 使用原始 2D 数组展示（单Sheet）
    const maxCols = 20
    const allRows = params.rawAllRows

    // 显示前 15 行
    const headEnd = Math.min(allRows.length, 15)
    parts.push(`\n## 原始行数据（前 ${headEnd} 行，数组索引对应列位置）`)
    for (let i = 0; i < headEnd; i++) {
      const row = allRows[i]
      if (!row) continue
      const trimmed = row.slice(0, maxCols).map((v: unknown) =>
        v === null || v === undefined ? '' : String(v).trim()
      )
      if (trimmed.some(v => v !== '')) {
        parts.push(`Row ${i}: ${JSON.stringify(trimmed)}`)
      }
    }

    // 显示尾部 10 行
    if (allRows.length > 15) {
      const tailStart = Math.max(headEnd, allRows.length - 10)
      parts.push(`\n## 原始行数据（末尾 ${allRows.length - tailStart} 行）`)
      for (let i = tailStart; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row) continue
        const trimmed = row.slice(0, maxCols).map((v: unknown) =>
          v === null || v === undefined ? '' : String(v).trim()
        )
        if (trimmed.some(v => v !== '')) {
          parts.push(`Row ${i}: ${JSON.stringify(trimmed)}`)
        }
      }
    }

    // 估算总列数
    const maxColCount = Math.max(...allRows.slice(0, headEnd).map(r => r?.length || 0))
    parts.push(`\n总列数约：${maxColCount}`)
  } else {
    // 降级到 object 格式
    parts.push(`\n## 表头列名\n${JSON.stringify(params.headers, null, 2)}`)

    if (params.headRows && params.headRows.length > 0) {
      parts.push(`\n## 文件前 ${params.headRows.length} 行\n${JSON.stringify(params.headRows, null, 2)}`)
    }

    if (params.sampleRows.length > 0) {
      parts.push(`\n## 数据样例（前 ${Math.min(params.sampleRows.length, 5)} 行）\n${JSON.stringify(params.sampleRows.slice(0, 5), null, 2)}`)
    }

    if (params.tailRows && params.tailRows.length > 0) {
      parts.push(`\n## 文件末尾 ${params.tailRows.length} 行\n${JSON.stringify(params.tailRows, null, 2)}`)
    }
  }

  parts.push(`\n请分析以上文件结构并生成解析规则。注意：headerRow 的 rowIndex 应指向真正的表头行（0-based），数据从该行之后开始。`)

  return parts.join('\n')
}
