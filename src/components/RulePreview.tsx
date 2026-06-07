"use client";

import { useMemo, useState } from "react";
import { Play, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParseRule, RawRow, OrderItem, STANDARD_FIELDS } from "@/lib/types";
import { applyRule, validateOrderItems } from "@/lib/rule-engine";

interface RulePreviewProps {
  rows: RawRow[]
  headers: string[]
  rule: ParseRule
}

export function RulePreview({ rows, headers, rule }: RulePreviewProps) {
  const [previewResult, setPreviewResult] = useState<{
    items: OrderItem[]
    orders: import("@/lib/types").OrderGroup[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = () => {
    try {
      setError(null)
      const result = applyRule(rows, headers, rule)
      setPreviewResult(result)
    } catch (err: any) {
      setError(err.message || "解析失败")
    }
  }

  const validatedItems = useMemo(() => {
    if (!previewResult) return []
    return validateOrderItems(previewResult.items)
  }, [previewResult])

  const errorCount = validatedItems.filter(item => item._errors && Object.keys(item._errors).length > 0).length

  // 字段覆盖率
  const coverageStats = useMemo(() => {
    if (validatedItems.length === 0) return {}
    const stats: Record<string, { filled: number; total: number; rate: string }> = {}
    STANDARD_FIELDS.forEach(field => {
      const filled = validatedItems.filter(item => {
        const val = (item as any)[field.key]
        return val !== undefined && val !== null && String(val).trim() !== ''
      }).length
      stats[field.key] = {
        filled,
        total: validatedItems.length,
        rate: `${Math.round((filled / validatedItems.length) * 100)}%`,
      }
    })
    return stats
  }, [validatedItems])

  if (!previewResult && !error) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Play className="w-3 h-3 mr-1" /> 执行试解析
          </Button>
          <span className="text-sm text-gray-500">预览当前规则的解析效果</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#0fc6c2]/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">试解析预览</CardTitle>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Play className="w-3 h-3 mr-1" /> 重新解析
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 inline mr-1" /> {error}
          </div>
        )}

        {previewResult && (
          <>
            {/* 摘要 */}
            <div className="flex gap-3 flex-wrap">
              <Badge variant="secondary">
                解析出 {previewResult.items.length} 条数据
              </Badge>
              <Badge variant="secondary">
                {previewResult.orders.length} 个订单组
              </Badge>
              {errorCount > 0 ? (
                <Badge variant="destructive">{errorCount} 个校验错误</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700">校验通过</Badge>
              )}
            </div>

            {/* 字段覆盖率 */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600">字段覆盖率</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                {STANDARD_FIELDS.map(field => {
                  const stat = coverageStats[field.key]
                  if (!stat) return null
                  const rate = parseInt(stat.rate)
                  return (
                    <div key={field.key} className="flex items-center gap-1 text-xs">
                      <span className="text-gray-500 w-16 truncate">{field.label}</span>
                      <div className="flex-1 h-1.5 bg-gray-200 rounded">
                        <div
                          className={`h-full rounded ${rate >= 80 ? 'bg-green-400' : rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-gray-600 w-8">{stat.rate}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 数据预览表格（前5行） */}
            {validatedItems.length > 0 && (
              <div className="border rounded overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1 text-left">外部编码</th>
                      <th className="px-2 py-1 text-left">收货门店</th>
                      <th className="px-2 py-1 text-left">SKU编码</th>
                      <th className="px-2 py-1 text-left">SKU名称</th>
                      <th className="px-2 py-1 text-left">数量</th>
                      <th className="px-2 py-1 text-left">收件人</th>
                      <th className="px-2 py-1 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedItems.slice(0, 5).map((item, idx) => {
                      const hasErr = item._errors && Object.keys(item._errors).length > 0
                      return (
                        <tr key={idx} className={hasErr ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1 truncate max-w-[80px]">{item.externalCode || '-'}</td>
                          <td className="px-2 py-1 truncate max-w-[80px]">{item.storeName || '-'}</td>
                          <td className="px-2 py-1">{item.skuCode}</td>
                          <td className="px-2 py-1 truncate max-w-[80px]">{item.skuName}</td>
                          <td className="px-2 py-1">{item.skuQuantity}</td>
                          <td className="px-2 py-1 truncate max-w-[60px]">{item.receiverName || '-'}</td>
                          <td className="px-2 py-1">
                            {hasErr ? (
                              <AlertCircle className="w-3 h-3 text-red-500" />
                            ) : (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {validatedItems.length > 5 && (
                  <p className="text-xs text-gray-400 text-center py-1">
                    ... 共 {validatedItems.length} 条，仅显示前 5 条
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
