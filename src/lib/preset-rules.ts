import { ParseRule } from './types'

/**
 * 预置解析规则库
 * 包含常见配送单、出库单、调拨单格式的解析规则
 */

// ============================================================
// 规则1：海口配送发货单（42列标准配送单）
// ============================================================
export const haikouDeliveryRule: ParseRule = {
  name: '海口配送发货单（黎明屯）',
  description: '黎明屯铁锅炖配送中心配送发货单，42列格式，含完整物流信息',
  fileType: 'excel',
  dataRegion: {
    headerRows: [3],
    dataStartRow: 4,
    skipHeadRows: 0,
  },
  operations: [
    { type: 'skipRows', count: 4 },
    { type: 'filterEmptyRows' },
    { type: 'skipTotalRows', patterns: ['合计', '总计'] },
    { type: 'tailExtract', rules: [
      { marker: '单据号', targetField: 'externalCode', extractPattern: '单据号[^\\d]*([A-Za-z0-9]+)' },
    ]},
  ],
  fieldMappings: {
    externalCode: '单据号',
    storeName: '订货机构',
    receiverName: '收货人',
    receiverPhone: '收货电话',
    receiverAddress: '收货地址',
    skuCode: '物品编码',
    skuName: '物品名称',
    skuQuantity: '发货数量',
    skuSpec: '规格型号',
    remark: '备注',
  },
  fieldConfidence: {
    externalCode: 'high',
    storeName: 'high',
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'high',
    remark: 'medium',
  },
}

// ============================================================
// 规则2：多门店分Sheet出库单
// ============================================================
export const multiStoreOutboundRule: ParseRule = {
  name: '多门店分Sheet出库单（尹三顺）',
  description: '尹三顺自助烤肉多门店出库单，每个Sheet对应一个门店，底部含收货人信息',
  fileType: 'excel',
  dataRegion: {
    headerRows: [3],
    dataStartRow: 4,
  },
  operations: [
    {
      type: 'multiSheet',
      perSheetTailExtract: [
        { marker: '收货门店：', targetField: 'storeName' },
        { marker: '联系人：', targetField: 'receiverName' },
        { marker: '联系电话：', targetField: 'receiverPhone' },
        { marker: '收货地址：', targetField: 'receiverAddress' },
      ],
    },
    { type: 'skipRows', count: 4 },
    { type: 'filterEmptyRows' },
    { type: 'skipTotalRows', patterns: ['合计', '总计'] },
  ],
  fieldMappings: {
    externalCode: null,
    storeName: null,
    receiverName: null,
    receiverPhone: null,
    receiverAddress: null,
    skuCode: '物品编码',
    skuName: '物品名称',
    skuQuantity: '出库数量',
    skuSpec: '规格型号',
    remark: '备注',
  },
  fieldConfidence: {
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'high',
    remark: 'medium',
  },
}

// ============================================================
// 规则3：欢乐牧场库存查询单
// ============================================================
export const huanlePastureInventoryRule: ParseRule = {
  name: '欢乐牧场库存查询单',
  description: '欢乐牧场库存查询单，含多门店分货列，门店为列维度',
  fileType: 'excel',
  dataRegion: {
    headerRows: [0],
    dataStartRow: 1,
  },
  operations: [
    { type: 'skipRows', count: 1 },
    { type: 'filterEmptyRows' },
  ],
  fieldMappings: {
    externalCode: '外部商品编码',
    storeName: null,
    receiverName: null,
    receiverPhone: null,
    receiverAddress: null,
    skuCode: 'SKU条码',
    skuName: 'SKU名称',
    skuQuantity: '在库数量的总和',
    skuSpec: '规格',
    remark: null,
  },
  fieldConfidence: {
    externalCode: 'high',
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'high',
  },
}

// ============================================================
// 规则4：湖南仓汇总单发货明细
// ============================================================
export const hunanWarehouseRule: ParseRule = {
  name: '湖南仓汇总单发货明细',
  description: '湖南仓库汇总单发货明细，含物品行号，支持多批次',
  fileType: 'excel',
  dataRegion: {
    headerRows: [1],
    dataStartRow: 2,
    skipHeadRows: 2,
  },
  operations: [
    { type: 'skipRows', count: 2 },
    { type: 'filterEmptyRows' },
    { type: 'aggregateBy', keyField: '配送单号', mergeStrategy: 'first', mergeFields: ['收货机构', '收货人', '收货电话', '收货地址', '发货仓库'] },
  ],
  fieldMappings: {
    externalCode: '配送单号',
    storeName: '收货机构',
    receiverName: '收货人',
    receiverPhone: '收货电话',
    receiverAddress: '收货地址',
    skuCode: '物品编码',
    skuName: '物品名称',
    skuQuantity: '发货数量',
    skuSpec: '规格型号',
    remark: '物品备注',
  },
  fieldConfidence: {
    externalCode: 'high',
    storeName: 'high',
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'high',
    remark: 'medium',
  },
}

// ============================================================
// 规则5：门店调拨单（卡片式）
// ============================================================
export const storeTransferRule: ParseRule = {
  name: '门店调拨单（卡片式）',
  description: '武汉配送中心门店调拨单，卡片式布局，每个调拨记录为一个卡片',
  fileType: 'excel',
  dataRegion: {
    headerRows: [6],
    dataStartRow: 7,
  },
  operations: [
    {
      type: 'cardBoundary',
      startMarker: '▶ 调拨记录 #(\\d+)',
      metaRowPatterns: [
        { pattern: '调入门店[^"]*"([^"]+)"', targetField: 'storeName', groupIndex: 1 },
        { pattern: '收货人[^"]*"([^"]+)"', targetField: 'receiverName', groupIndex: 1 },
        { pattern: '电话[^"]*"([^"]+)"', targetField: 'receiverPhone', groupIndex: 1 },
        { pattern: '收货地址[^"]*"([^"]+)"', targetField: 'receiverAddress', groupIndex: 1 },
      ],
      cardHeaderMarker: '物品编码',
    },
    { type: 'skipRows', count: 7 },
    { type: 'filterEmptyRows' },
  ],
  fieldMappings: {
    externalCode: null,
    storeName: '调入门店',
    receiverName: '收货人',
    receiverPhone: '电话',
    receiverAddress: '收货地址',
    skuCode: '物品编码',
    skuName: '物品名称',
    skuQuantity: '数量',
    skuSpec: '规格',
    remark: null,
  },
  fieldConfidence: {
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'high',
  },
}

// ============================================================
// 规则6：黔寨寨配送单（PDF）
// ============================================================
export const qianZhaiDeliveryRule: ParseRule = {
  name: '黔寨寨配送发货单（PDF）',
  description: '黔寨寨贵州烙锅配送发货单，PDF格式，2页，含完整物品列表',
  fileType: 'pdf',
  dataRegion: {
    skipHeadRows: 0,
    skipTailRows: 0,
  },
  operations: [
    { type: 'skipRows', count: 15 },
    { type: 'filterEmptyRows' },
    { type: 'skipTotalRows', patterns: ['合计', '总计', '第\\d+页'] },
    {
      type: 'regexExtract',
      sourceField: 'items',
      pattern: '([A-Za-z0-9]+)\\s+([\\u4e00-\\u9fa5]+[\\u4e00-\\u9fa5\\d]*)\\s+([\\d]+)',
      targetField: 'skuCode',
      groupIndex: 1,
      searchScope: 'data',
    },
    { type: 'headerExtract', rules: [
      { marker: '单据编号：', targetField: 'externalCode', extractPattern: '单据编号：\\s*([A-Za-z0-9]+)' },
      { marker: '收货机构：', targetField: 'storeName', extractPattern: '收货机构：\\s*([^\\s]+)' },
      { marker: '收货电话：', targetField: 'receiverPhone', extractPattern: '收货电话：\\s*([\\d-]+)' },
    ]},
  ],
  fieldMappings: {
    externalCode: '单据编号',
    storeName: '收货机构',
    receiverName: null,
    receiverPhone: '收货电话',
    receiverAddress: null,
    skuCode: '物品编码',
    skuName: '物品名称',
    skuQuantity: '发货数量',
    skuSpec: '规格型号',
    remark: '备注',
  },
  fieldConfidence: {
    externalCode: 'high',
    storeName: 'high',
    skuCode: 'high',
    skuName: 'high',
    skuQuantity: 'high',
    skuSpec: 'medium',
  },
}

// ============================================================
// 预置规则索引
// ============================================================
export const presetRules: Record<string, ParseRule> = {
  '12.25海口龙湖天街': haikouDeliveryRule,
  '多门店分Sheet出库单': multiStoreOutboundRule,
  '欢乐牧场模板0430': huanlePastureInventoryRule,
  '湖南仓': hunanWarehouseRule,
  '门店调拨单-卡片式': storeTransferRule,
  '黔寨寨贵州烙锅': qianZhaiDeliveryRule,
}

/**
 * 根据文件名匹配预置规则
 */
export function matchPresetRule(fileName: string): ParseRule | null {
  for (const [key, rule] of Object.entries(presetRules)) {
    if (fileName.includes(key)) {
      return rule
    }
  }
  return null
}
