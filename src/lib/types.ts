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

export interface ParseRule {
  id?: number
  name: string
  fileType: 'excel' | 'word' | 'pdf'
  operations: RuleOperation[]
  fieldMappings: Record<string, string | null>
  createdAt?: string
  updatedAt?: string
}

export type RuleOperation =
  | { type: 'skipRows'; count: number }
  | { type: 'headerRow'; rowIndex: number }
  | { type: 'footerSkipRows'; count: number }
  | { type: 'aggregateBy'; keyField: string }
  | { type: 'transpose'; skuCol: string; valueCols: string[]; valueColHeaders?: string[] }
  | { type: 'multiSheet'; merge: boolean }
  | { type: 'cardBoundary'; startMarker: string }
  | { type: 'compositeCell'; splitPattern: string; quantityPattern: string }
  | { type: 'regexExtract'; field: string; pattern: string; groupIndex?: number }
  | { type: 'tailExtract'; markers: string[]; mappings: Record<string, string> }
  | { type: 'staticValue'; field: string; value: string }
  | { type: 'filterEmptyRows' }
  | { type: 'skipTotalRows' }

export interface ParsedFile {
  sheets?: string[]
  headers: string[]
  rows: any[]
  rawData: any
}

export interface ValidationError {
  rowIndex: number
  field: string
  message: string
}
