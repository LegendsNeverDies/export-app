import { NextRequest, NextResponse } from 'next/server'
import { applyRule, validateOrderItems } from '@/lib/rule-engine'
import { ParseRule, ParsedFile } from '@/lib/types'

/**
 * 测试端点：对解析后的数据应用规则并返回结果
 * 用于端到端测试，不需要前端 UI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { parsedData, rule, sheetIndex = 0 } = body

    if (!parsedData || !rule) {
      return NextResponse.json({ success: false, message: '缺少 parsedData 或 rule' }, { status: 400 })
    }

    const pd: ParsedFile = parsedData
    const parseRule: ParseRule = rule

    const currentSheetData = pd.parsedSheets?.[sheetIndex] || {
      headers: pd.headers,
      rows: pd.rows,
    }

    // 构建数据
    const allRows = currentSheetData.rows || pd.rows
    const headers = currentSheetData.headers || pd.headers

    // 获取当前 sheet 的 allRows，供 headerRow 操作使用
    const currentAllRows = currentSheetData.allRows || (pd.parsedSheets?.[sheetIndex] as any)?.allRows

    const allParsedSheets = (pd.parsedSheets || []).map((ps, idx) => ({
      rows: ps.rows,
      headers: ps.headers,
      name: ps.name,
      // 确保 allRows 被传递
      allRows: ps.allRows || (pd.parsedSheets?.[idx] as any)?.allRows,
    }))

    if (allParsedSheets.length === 0) {
      allParsedSheets.push({
        rows: pd.rows,
        headers: pd.headers,
        name: 'Sheet1',
        allRows: currentAllRows,
      })
    }

    const result = applyRule(allRows, headers, parseRule, allParsedSheets)
    const validated = validateOrderItems(result.items)

    const errorCount = validated.filter(item => item._errors && Object.keys(item._errors).length > 0).length
    const summary = {
      totalItems: result.items.length,
      totalGroups: result.orders.length,
      errorCount,
      sampleItems: result.items.slice(0, 5).map(item => ({
        externalCode: item.externalCode,
        storeName: item.storeName,
        receiverName: item.receiverName,
        receiverPhone: item.receiverPhone,
        skuCode: item.skuCode,
        skuName: item.skuName,
        skuQuantity: item.skuQuantity,
        skuSpec: item.skuSpec,
      })),
      errors: errorCount > 0 ? validated.filter(item => item._errors && Object.keys(item._errors).length > 0).slice(0, 3).map(item => ({
        skuCode: item.skuCode,
        skuName: item.skuName,
        errors: item._errors,
      })) : [],
    }

    return NextResponse.json({ success: true, data: summary })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
