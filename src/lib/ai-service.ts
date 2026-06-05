import { ParseRule } from './types'

export async function analyzeFileWithAI(
  fileName: string,
  headers: string[],
  sampleRows: any[],
  apiKey: string
): Promise<{ rule: ParseRule; explanation: string }> {
  const prompt = buildAnalysisPrompt(fileName, headers, sampleRows)

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的物流订单解析规则生成助手。你需要分析文件结构并生成JSON格式的解析规则。

可用操作类型：
- skipRows: 跳过前N行（干扰头部）
- headerRow: 指定表头所在行索引（0-based）
- footerSkipRows: 跳过尾部N行
- aggregateBy: 按字段聚合（如按配送单号分组）
- transpose: 矩阵转置（如SKU×门店矩阵）
- multiSheet: 多Sheet合并
- cardBoundary: 卡片边界识别
- compositeCell: 复合单元格拆分
- regexExtract: 正则提取
- tailExtract: 尾部信息提取
- staticValue: 静态值
- filterEmptyRows: 过滤空行
- skipTotalRows: 跳过合计行

字段映射目标：externalCode(外部编码), storeName(收货门店), receiverName(收件人姓名), receiverPhone(收件人电话), receiverAddress(收件人地址), skuCode(SKU物品编码), skuName(SKU物品名称), skuQuantity(SKU发货数量), skuSpec(SKU规格型号), remark(备注)

重要：每个字段映射需标注confidence（high/medium/low），表示匹配置信度：
- high: 列名精确匹配标准字段名
- medium: 列名语义相近但非完全一致
- low: 根据数据特征推断，可能存在偏差

只返回JSON，不要其他解释。`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API错误: ${err}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content || ''

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回格式不正确')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    rule: {
      ...parsed.rule,
      fieldConfidence: parsed.rule.fieldConfidence || {},
    } as ParseRule,
    explanation: parsed.explanation || '',
  }
}

function buildAnalysisPrompt(fileName: string, headers: string[], sampleRows: any[]): string {
  return `请分析以下物流出库单文件并生成解析规则：

文件名：${fileName}

表头（前10行）：
${JSON.stringify(headers, null, 2)}

样例数据（前5行）：
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

请生成解析规则，要求：
1. 识别文件结构特征（干扰头部、表头位置、数据区域、尾部信息等）
2. 将列映射到标准字段，每个映射标注置信度(confidence: high/medium/low)
3. 如有特殊结构（矩阵、卡片式、聚合等）配置相应操作
4. 返回格式：
{
  "rule": {
    "name": "规则名称",
    "fileType": "excel|word|pdf",
    "operations": [{"type": "...", ...}],
    "fieldMappings": {"目标字段": "源列名", ...},
    "fieldConfidence": {"目标字段": "high/medium/low", ...}
  },
  "explanation": "规则说明，包括对低置信度映射的特别说明"
}

fieldConfidence标注标准：
- high: 列名精确匹配（如列名"SKU物品编码"→skuCode）
- medium: 列名语义相关但非完全一致（如列名"物料号"→skuCode）
- low: 根据数据特征猜测，可能有误`
}
