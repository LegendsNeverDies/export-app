// ============================================================
// 万能导入 V2 — 核心类型定义
// 所有规则相关类型均不含硬编码列名，列名完全来自 fieldMappings
// ============================================================

/** 解析后的原始行数据 */
export interface RawRow {
  [key: string]: unknown
  _rowIndex?: number
  _sheetIndex?: number
}

// ---- 订单数据模型 ----

export interface OrderItem {
  id?: string
  externalCode?: string
  storeName?: string
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  skuCode: string
  skuName: string
  skuQuantity: number
  skuSpec?: string
  remark?: string
  _rowIndex?: number
  _sheetIndex?: number
  _errors?: Record<string, string>
  _duplicateWith?: number[]
}

export interface OrderGroup {
  externalCode?: string
  storeName?: string
  receiverName?: string
  receiverPhone?: string
  receiverAddress?: string
  items: OrderItem[]
  remark?: string
}

// ---- 文件解析结果 ----

export interface ParsedSheet {
  name: string
  totalRows: number
  totalCols: number
  /** 所有行的原始二维数组数据 */
  allRows: unknown[][]
  /** 表头列名（取自 allRows 的某一行，由规则指定哪行是表头） */
  headers: string[]
  /** 所有行的对象格式（headers → 值映射） */
  rows: RawRow[]
}

export interface ParsedPdfPage {
  pageIndex: number
  text: string
  tables?: Array<{
    rows: string[][]
    headers: string[]
  }>
}

export interface ParsedPdfSection {
  type: 'order' | 'header' | 'footer'
  text: string
  startPage: number
  endPage: number
}

export interface ParsedPdf {
  pages: ParsedPdfPage[]
  sections: ParsedPdfSection[]
  headers: string[]
  rows: RawRow[]
  fullText: string
}

export interface ParsedFile {
  sheets?: string[]
  headers: string[]
  rows: RawRow[]
  rawData: unknown
  /** 结构化 Sheet 数据（Excel 多 Sheet 时使用） */
  parsedSheets?: ParsedSheet[]
  /** PDF 结构化数据 */
  parsedPdf?: ParsedPdf
}

// ---- 数据区域定义 ----

export interface DataRegion {
  /** 表头行索引列表（0-based），支持多行表头 */
  headerRows?: number[]
  /** 数据起始行（相对于 headerRows 之后） */
  dataStartRow?: number
  /** 跳过的头部行数 */
  skipHeadRows?: number
  /** 跳过的尾部行数 */
  skipTailRows?: number
  /** 数据结束标记（正则，匹配到则停止） */
  endMarker?: string
}

// ---- 解析规则 DSL ----

export interface ParseRule {
  id?: number
  name: string
  description?: string
  fileType: 'excel' | 'pdf'
  /** 数据区域定义 */
  dataRegion?: DataRegion
  /** 操作管道（按顺序执行） */
  operations: RuleOperation[]
  /** 字段映射：目标字段 key → 源列名 */
  fieldMappings: Record<string, string | null>
  /** 字段置信度（AI 生成时标注） */
  fieldConfidence?: Record<string, 'high' | 'medium' | 'low'>
  createdAt?: string
  updatedAt?: string
}

// ---- 规则操作类型（16 种算子） ----

export type RuleOperation =
  | SkipRowsOp
  | HeaderRowOp
  | FooterSkipOp
  | FilterEmptyOp
  | SkipTotalOp
  | AggregateByOp
  | TransposeOp
  | MultiSheetOp
  | CardBoundaryOp
  | CompositeCellOp
  | RegexExtractOp
  | TailExtractOp
  | HeaderExtractOp
  | StaticValueOp
  | CellSplitOp
  | DoubleTransposeOp

/** 跳过前 N 行 */
export interface SkipRowsOp {
  type: 'skipRows'
  count: number
}

/** 指定表头行索引（0-based），该行之后为数据区 */
export interface HeaderRowOp {
  type: 'headerRow'
  rowIndex: number
}

/** 跳过尾部 N 行 */
export interface FooterSkipOp {
  type: 'footerSkipRows'
  count: number
}

/** 过滤空行 */
export interface FilterEmptyOp {
  type: 'filterEmptyRows'
}

/** 跳过合计行 */
export interface SkipTotalOp {
  type: 'skipTotalRows'
  /** 合计行匹配模式，默认 ['合计','总计','total','小计'] */
  patterns?: string[]
}

/** 按字段聚合 */
export interface AggregateByOp {
  type: 'aggregateBy'
  /** 聚合键字段（源列名） */
  keyField: string
  /** 非键字段的合并策略 */
  mergeStrategy?: 'first' | 'concat'
  /** 需要从组内非空行填充的字段（源列名列表） */
  mergeFields?: string[]
}

/** 矩阵转置：将门店×SKU 矩阵转为一行一个门店+SKU */
export interface TransposeOp {
  type: 'transpose'
  /** 固定列：转置后每行都保留的列（源列名列表） */
  fixedCols: string[]
  /** 转置列：需要转置为行的列（源列名列表） */
  transposeCols: string[]
  /** 转置列名映射到哪个目标字段（如 storeName） */
  transposedKeyField: string
  /** 转置值映射到哪个目标字段（如 skuQuantity） */
  transposedValueField: string
  /** 只保留值大于此阈值的行，默认 0 */
  minValue?: number
}

/** 多 Sheet 合并 */
export interface MultiSheetOp {
  type: 'multiSheet'
  /** 每个 Sheet 独立解析后合并 */
  perSheetTailExtract?: TailExtractOp['rules']
}

/** 卡片边界识别 */
export interface CardBoundaryOp {
  type: 'cardBoundary'
  /** 卡片起始标记（正则表达式） */
  startMarker: string
  /** 卡片内元信息行识别规则 */
  metaRowPatterns: Array<{
    /** 正则匹配该行（匹配对象为整行 JSON.stringify 后的文本） */
    pattern: string
    /** 映射到目标字段 key */
    targetField: string
    /** 正则分组索引，默认 1 */
    groupIndex?: number
  }>
  /** 卡片内数据区的表头行标识（如"物品编码"） */
  cardHeaderMarker?: string
}

/** 复合单元格拆分 */
export interface CompositeCellOp {
  type: 'compositeCell'
  /** 需要拆分的列（源列名） */
  sourceCol: string
  /** 拆分分隔符或正则 */
  splitPattern: string
  /** 名称提取正则 */
  namePattern: string
  /** 数量提取正则 */
  quantityPattern: string
  /** 名称映射到的目标字段 key */
  nameTargetField: string
  /** 数量映射到的目标字段 key */
  quantityTargetField: string
}

/** 正则提取 */
export interface RegexExtractOp {
  type: 'regexExtract'
  /** 源字段（源列名） */
  sourceField: string
  /** 正则表达式 */
  pattern: string
  /** 提取结果映射到目标字段 key */
  targetField: string
  /** 正则分组索引，默认 1 */
  groupIndex?: number
  /** 搜索范围 */
  searchScope?: 'all' | 'header' | 'footer' | 'data'
}

/** 尾部信息提取 */
export interface TailExtractOp {
  type: 'tailExtract'
  /** 提取规则列表 */
  rules: Array<{
    /** 标记文本（如"收货人："） */
    marker: string
    /** 映射到目标字段 key */
    targetField: string
    /** 提取正则（不提供则取 marker 后的所有文本） */
    extractPattern?: string
    /** 正则分组索引 */
    groupIndex?: number
    /** 从倒数第 N 行开始搜索 */
    searchFromBottom?: number
  }>
  /** 提取的值应用到哪些行：all=所有行, group=同组行 */
  applyScope?: 'all' | 'group'
}

/** 头部信息提取 */
export interface HeaderExtractOp {
  type: 'headerExtract'
  /** 提取规则列表 */
  rules: Array<{
    /** 标记文本（如"配送单号："） */
    marker: string
    /** 映射到目标字段 key */
    targetField: string
    /** 提取正则 */
    extractPattern?: string
    /** 正则分组索引 */
    groupIndex?: number
    /** 从第 N 行开始搜索 */
    searchFromTop?: number
  }>
}

/** 静态值填充 */
export interface StaticValueOp {
  type: 'staticValue'
  /** 目标字段 key */
  field: string
  /** 静态值 */
  value: string
}

/** 单元格拆分（按分隔符拆分后正则提取字段） */
export interface CellSplitOp {
  type: 'cellSplit'
  /** 需要拆分的列（源列名） */
  sourceCol: string
  /** 分隔符 */
  separator: string
  /** 拆分后每行的解析规则 */
  linePatterns: Array<{
    /** 正则表达式 */
    pattern: string
    /** 正则分组名 → 目标字段 key */
    fieldMappings: Record<string, string>
  }>
}

/** 双重转置（行维度+列维度同时展开，如门店×日期矩阵） */
export interface DoubleTransposeOp {
  type: 'doubleTranspose'
  /** 行维度列名（源列名，如门店名纵向排列的列） */
  rowDimensionCol: string
  /** 列维度起始列索引（0-based） */
  colDimensionStart: number
  /** 列维度表头行索引（0-based） */
  colDimensionHeaderRow: number
  /** 转置后行维度映射到的目标字段 key */
  rowTargetField: string
  /** 转置后列维度映射到的目标字段 key */
  colTargetField: string
  /** 值映射到的目标字段 key */
  valueTargetField: string
  /** 值内部是否包含复合内容需要进一步拆分 */
  valueIsComposite?: boolean
  /** 复合内容拆分正则 */
  compositeSplitPattern?: string
  /** 复合内容名称提取正则 */
  compositeNamePattern?: string
  /** 复合内容数量提取正则 */
  compositeQtyPattern?: string
}

// ---- 校验错误 ----

export interface ValidationError {
  rowIndex: number
  field: string
  message: string
}

// ---- 标准字段定义 ----

export const STANDARD_FIELDS = [
  { key: 'externalCode', label: '外部编码', required: false, group: 'B' },
  { key: 'storeName', label: '收货门店', required: false, group: 'A' },
  { key: 'receiverName', label: '收件人姓名', required: false, group: 'B' },
  { key: 'receiverPhone', label: '收件人电话', required: false, group: 'B' },
  { key: 'receiverAddress', label: '收件人地址', required: false, group: 'B' },
  { key: 'skuCode', label: 'SKU物品编码', required: true, group: 'none' },
  { key: 'skuName', label: 'SKU物品名称', required: true, group: 'none' },
  { key: 'skuQuantity', label: 'SKU发货数量', required: true, group: 'none' },
  { key: 'skuSpec', label: 'SKU规格型号', required: false, group: 'none' },
  { key: 'remark', label: '备注', required: false, group: 'none' },
] as const

/** A 组字段（收货门店）和 B 组字段（收件人信息）至少填一组 */
export const GROUP_A_FIELDS = ['storeName'] as const
export const GROUP_B_FIELDS = ['receiverName', 'receiverPhone', 'receiverAddress'] as const
