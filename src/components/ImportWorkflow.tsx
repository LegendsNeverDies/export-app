"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Upload, FileSpreadsheet, Sparkles, Play, Save, Download, Trash2, Plus, AlertCircle, CheckCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast, nextToastId } from "@/lib/toast-utils";
import { applyRule, validateOrderItems } from "@/lib/rule-engine";
import { ParseRule, OrderItem, ParsedFile, RawRow, STANDARD_FIELDS } from "@/lib/types";
import { DataPreview } from "./DataPreview";
import { RulePreview } from "./RulePreview";

const OPERATION_TYPES = [
  { value: "skipRows", label: "跳过前N行", params: [{ key: "count", label: "行数", type: "number" }] },
  { value: "headerRow", label: "表头所在行", params: [{ key: "rowIndex", label: "行索引(0-based)", type: "number" }] },
  { value: "footerSkipRows", label: "跳过尾部N行", params: [{ key: "count", label: "行数", type: "number" }] },
  { value: "aggregateBy", label: "按字段聚合", params: [{ key: "keyField", label: "聚合字段(源列名)", type: "text" }, { key: "mergeFields", label: "填充字段(逗号分隔)", type: "text" }] },
  { value: "transpose", label: "矩阵转置", params: [{ key: "fixedCols", label: "固定列(逗号分隔)", type: "text" }, { key: "transposeCols", label: "转置列(逗号分隔)", type: "text" }, { key: "transposedKeyField", label: "转置键目标字段", type: "text" }, { key: "transposedValueField", label: "转置值目标字段", type: "text" }] },
  { value: "multiSheet", label: "多Sheet合并", params: [] },
  { value: "cardBoundary", label: "卡片边界识别", params: [{ key: "startMarker", label: "卡片起始标记(正则)", type: "text" }, { key: "cardHeaderMarker", label: "卡片内表头标记", type: "text" }] },
  { value: "compositeCell", label: "复合单元格拆分", params: [{ key: "sourceCol", label: "源列名", type: "text" }, { key: "splitPattern", label: "拆分正则", type: "text" }, { key: "namePattern", label: "名称正则", type: "text" }, { key: "quantityPattern", label: "数量正则", type: "text" }, { key: "nameTargetField", label: "名称目标字段", type: "text" }, { key: "quantityTargetField", label: "数量目标字段", type: "text" }] },
  { value: "regexExtract", label: "正则提取", params: [{ key: "sourceField", label: "源字段", type: "text" }, { key: "pattern", label: "正则表达式", type: "text" }, { key: "targetField", label: "目标字段", type: "text" }, { key: "groupIndex", label: "分组索引", type: "number" }] },
  { value: "tailExtract", label: "尾部信息提取", params: [{ key: "rules", label: "规则(JSON数组)", type: "text" }] },
  { value: "headerExtract", label: "头部信息提取", params: [{ key: "rules", label: "规则(JSON数组)", type: "text" }] },
  { value: "staticValue", label: "静态值填充", params: [{ key: "field", label: "目标字段", type: "text" }, { key: "value", label: "静态值", type: "text" }] },
  { value: "cellSplit", label: "单元格拆分", params: [{ key: "sourceCol", label: "源列名", type: "text" }, { key: "separator", label: "分隔符", type: "text" }, { key: "linePatterns", label: "行匹配规则(JSON)", type: "text" }] },
  { value: "doubleTranspose", label: "双重转置", params: [{ key: "rowDimensionCol", label: "行维度列名", type: "text" }, { key: "colDimensionStart", label: "列维度起始索引", type: "number" }, { key: "rowTargetField", label: "行维度目标字段", type: "text" }, { key: "colTargetField", label: "列维度目标字段", type: "text" }, { key: "valueTargetField", label: "值目标字段", type: "text" }] },
  { value: "filterEmptyRows", label: "过滤空行", params: [] },
  { value: "skipTotalRows", label: "跳过合计行", params: [{ key: "patterns", label: "匹配模式(逗号分隔)", type: "text" }] },
];

interface ImportWorkflowProps {
  apiKey: string;
}

export function ImportWorkflow({ apiKey }: ImportWorkflowProps) {
  const [step, setStep] = useState<"upload" | "rule" | "preview" | "submit">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedFile[]>([]);
  const [currentSheet, setCurrentSheet] = useState(0);
  const [rules, setRules] = useState<ParseRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [currentRule, setCurrentRule] = useState<ParseRule | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSheetData = parsedData[currentSheet] || { headers: [], rows: [] };

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.success) {
        const loaded = data.data.map((r: any) => ({
          ...r,
          operations: typeof r.operations === "string" ? JSON.parse(r.operations) : r.operations,
          fieldMappings: typeof r.field_mappings === "string" ? JSON.parse(r.field_mappings) : r.field_mappings,
          fieldConfidence: typeof r.field_confidence === "string" ? JSON.parse(r.field_confidence) : r.field_confidence,
          dataRegion: typeof r.data_region === "string" ? JSON.parse(r.data_region) : r.data_region,
        }));
        setRules(loaded);
      }
    } catch (e) {
      console.error("加载规则失败", e);
    }
  }, []);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseProgress(0);
    try {
      const estimatedDuration = Math.min(Math.max(selectedFile.size / 50000, 500), 3000);
      const startTime = Date.now();
      const progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(Math.round((elapsed / estimatedDuration) * 80), 80);
        setParseProgress(pct);
      }, 100);

      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      clearInterval(progressTimer);

      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setParseProgress(100);
      setParsedData(data.data);
      setCurrentSheet(0);
      setStep("rule");
      await loadRules();
      toast.success(`成功解析文件，共 ${data.data.length} 个Sheet`, { id: nextToastId() });
    } catch (err: any) {
      toast.error(err.message || "文件解析失败", { id: nextToastId() });
    } finally {
      setTimeout(() => setIsParsing(false), 300);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleAIAnalyze = async () => {
    if (!apiKey) {
      toast.error("请先在设置中配置 DeepSeek API Key", { id: nextToastId() });
      return;
    }

    setIsAnalyzing(true);
    try {
      // 准备上下文：头部行、尾部行、样例行
      const allRows = currentSheetData.rows;
      const headRows = allRows.slice(0, 10);
      const tailRows = allRows.slice(-10);
      const sampleRows = allRows.slice(0, 5);

      // 获取原始 2D 数组数据（优先用于 AI 分析）
      const rawAllRows = (currentSheetData as any).parsedSheet?.allRows ||
        parsedData[currentSheet]?.parsedSheets?.[0]?.allRows;

      // 多Sheet文件：收集所有Sheet的原始数据
      const isMultiSheet = parsedData.length > 1;
      const rawAllSheets = isMultiSheet ? parsedData.map(p => ({
        name: (p.rawData as any)?.sheetName || p.parsedSheets?.[0]?.name || 'Sheet',
        allRows: p.parsedSheets?.[0]?.allRows || [],
      })).filter(s => s.allRows.length > 0) : undefined;

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file?.name,
          headers: currentSheetData.headers,
          sampleRows,
          headRows,
          tailRows,
          sheetNames: parsedData.map(p => p.sheets?.[0] || 'Sheet'),
          totalRows: allRows.length,
          pdfFullText: (currentSheetData as any).parsedPdf?.fullText,
          rawAllRows,
          rawAllSheets,
          apiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRule(data.data.rule);
        setAiExplanation(data.data.explanation || "");
        const lowConfFields = Object.entries(data.data.rule.fieldConfidence || {}).filter(([, v]: any) => v === "low").map(([k]) => k);
        if (lowConfFields.length > 0) {
          toast.success("AI 分析完成", {
            id: nextToastId(),
            description: `${lowConfFields.length} 个字段为低置信度推测，请重点检查`,
          });
        } else {
          toast.success("AI 分析完成，请检查规则配置", { id: nextToastId() });
        }
      } else {
        toast.error(data.message || "AI 分析失败", { id: nextToastId() });
      }
    } catch (err: any) {
      toast.error(err.message, { id: nextToastId() });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleParseWithRule = () => {
    if (!currentRule) return;

    try {
      const allRows = parsedData.flatMap((sheet, idx) => {
        if (currentRule.operations.some((op: any) => op.type === "multiSheet")) {
          return sheet.rows.map(r => ({ ...r, _sheetIndex: idx }));
        }
        return idx === currentSheet ? sheet.rows : [];
      });

      // 传递 allRows（原始 2D 数据），用于 headerRow 重新映射
      const allParsedSheets = parsedData.map((p, idx) => ({
        rows: p.rows,
        headers: p.headers,
        name: p.sheets?.[idx] || `Sheet${idx + 1}`,
        allRows: (p as any).parsedSheets?.[0]?.allRows,
      }));

      const result = applyRule(allRows, currentSheetData.headers, currentRule, allParsedSheets);
      setOrderItems(result.items);
      setStep("preview");
      toast.success(`解析完成，共 ${result.items.length} 条数据`, { id: nextToastId() });
    } catch (err: any) {
      toast.error(err.message || "解析失败", { id: nextToastId() });
    }
  };

  const handleSaveRule = async () => {
    if (!currentRule || !ruleName.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          description: currentRule.description,
          fileType: currentRule.fileType || "excel",
          dataRegion: currentRule.dataRegion,
          operations: currentRule.operations,
          fieldMappings: currentRule.fieldMappings,
          fieldConfidence: currentRule.fieldConfidence,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("规则保存成功", { id: nextToastId() });
        setShowRuleDialog(false);
        await loadRules();
      } else {
        toast.error(data.message, { id: nextToastId() });
      }
    } catch (err: any) {
      toast.error(err.message, { id: nextToastId() });
    }
  };

  const handleSubmit = async () => {
    const validItems = orderItems.filter(item => !item._errors || Object.keys(item._errors).length === 0);
    if (validItems.length === 0) {
      toast.error("没有可提交的数据，请先修正错误", { id: nextToastId() });
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress(0);
    setSubmittedCount(0);

    try {
      const batchSize = 100;
      let totalImported = 0;
      let totalFailed = 0;

      for (let i = 0; i < validItems.length; i += batchSize) {
        const batch = validItems.slice(i, i + batchSize);
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders: batch }),
        });
        const data = await res.json();

        if (data.success) {
          totalImported += data.data?.imported ?? batch.length;
          totalFailed += data.data?.failed ?? 0;
        } else {
          totalFailed += batch.length;
        }

        setSubmittedCount(i + batch.length);
        setSubmitProgress(Math.round(((i + batch.length) / validItems.length) * 100));
      }

      if (totalFailed === 0) {
        toast.success(`成功导入 ${totalImported} 条数据`, { id: nextToastId() });
      } else {
        toast.success(`导入完成：${totalImported} 条成功，${totalFailed} 条失败`, { id: nextToastId() });
      }

      setStep("upload");
      setFile(null);
      setParsedData([]);
      setOrderItems([]);
    } catch (err: any) {
      toast.error(err.message, { id: nextToastId() });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    const headers = ["外部编码", "收货门店", "收件人姓名", "收件人电话", "收件人地址", "SKU物品编码", "SKU物品名称", "SKU发货数量", "SKU规格型号", "备注"];
    const rows = orderItems.map(item => [
      item.externalCode || "",
      item.storeName || "",
      item.receiverName || "",
      item.receiverPhone || "",
      item.receiverAddress || "",
      item.skuCode,
      item.skuName,
      String(item.skuQuantity),
      item.skuSpec || "",
      item.remark || "",
    ]);

    const XLSX = await import("xlsx");
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "导入数据");
    XLSX.writeFile(wb, `导入数据_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const validatedItems = useMemo(() => {
    return validateOrderItems(orderItems);
  }, [orderItems]);

  const errorCount = validatedItems.filter(item => item._errors && Object.keys(item._errors).length > 0).length;
  const duplicateCount = validatedItems.filter(item => item._duplicateWith && item._duplicateWith.length > 0).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {["上传文件", "配置规则", "数据预览", "提交下单"].map((label, idx) => {
          const steps: Array<"upload" | "rule" | "preview" | "submit"> = ["upload", "rule", "preview", "submit"];
          const currentIdx = steps.indexOf(step);
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
                isActive ? "bg-[#0fc6c2] text-white shadow-md" : isDone ? "bg-[#e8fafa] text-[#0b6e6e]" : "bg-gray-100 text-gray-500"
              }`}>
                {isDone ? <CheckCircle className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-xs">{idx + 1}</span>}
                {label}
              </div>
              {idx < 3 && <div className={`w-6 md:w-8 h-px ${isDone ? "bg-[#0fc6c2]" : "bg-gray-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card>
            <CardContent className="pt-6">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-[#0fc6c2] hover:bg-[#e8fafa] transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-base font-medium text-gray-700">点击或拖拽文件至此处上传</p>
                <p className="text-sm text-gray-500 mt-2">支持 Excel（.xlsx/.xls）、PDF 格式</p>
              </div>
              {isParsing && (
                <div className="mt-4 space-y-2">
                  <Progress value={parseProgress} className="h-2" />
                  <div className="flex items-center justify-center gap-2 text-[#0fc6c2] text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{parseProgress >= 100 ? "解析完成" : `正在解析文件... ${parseProgress}%`}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rule Step */}
      {step === "rule" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">文件信息</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    {parsedData.length > 1 && (
                      <Select value={String(currentSheet)} onValueChange={(v) => setCurrentSheet(Number(v))}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="选择Sheet" />
                        </SelectTrigger>
                        <SelectContent>
                          {parsedData.map((_, idx) => (
                            <SelectItem key={idx} value={String(idx)}>Sheet {idx + 1}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setFile(null); }}>
                      <X className="w-4 h-4 mr-1" /> 重新上传
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileSpreadsheet className="w-4 h-4 text-[#0fc6c2]" />
                  <span>{file?.name}</span>
                  <Badge variant="secondary">{currentSheetData.rows.length} 行</Badge>
                  <Badge variant="secondary">{currentSheetData.headers.length} 列</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">选择或配置解析规则</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAIAnalyze}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                      AI 辅助生成
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      {showPreview ? "隐藏" : "显示"}试解析预览
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Rule Selection */}
                <div className="flex gap-2 flex-wrap">
                  <Select
                    value={selectedRuleId ? String(selectedRuleId) : ""}
                    onValueChange={(v) => {
                      const rule = rules.find(r => r.id === Number(v));
                      if (rule) {
                        setSelectedRuleId(rule.id!);
                        setCurrentRule(rule);
                        setAiExplanation("");
                      }
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder="选择已有规则" />
                    </SelectTrigger>
                    <SelectContent>
                      {rules.map(rule => (
                        <SelectItem key={rule.id} value={String(rule.id)}>{rule.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentRule({
                        name: "",
                        fileType: "excel",
                        operations: [],
                        fieldMappings: {},
                      });
                      setSelectedRuleId(null);
                      setAiExplanation("");
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" /> 新建规则
                  </Button>
                </div>

                {/* Rule Configuration */}
                {currentRule && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">规则名称</label>
                        <Input
                          value={currentRule.name}
                          onChange={(e) => setCurrentRule({ ...currentRule, name: e.target.value })}
                          placeholder="输入规则名称"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">文件类型</label>
                        <Select
                          value={currentRule.fileType}
                          onValueChange={(v: any) => setCurrentRule({ ...currentRule, fileType: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="excel">Excel</SelectItem>
                            <SelectItem value="pdf">PDF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Operations */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">解析操作</label>
                      <div className="space-y-2">
                        {currentRule.operations.map((op: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded flex-wrap">
                            <Select
                              value={op.type}
                              onValueChange={(v) => {
                                const newOps = [...currentRule.operations];
                                newOps[idx] = { type: v } as any;
                                setCurrentRule({ ...currentRule, operations: newOps });
                              }}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OPERATION_TYPES.map(t => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {OPERATION_TYPES.find(t => t.value === op.type)?.params.map((param: any) => {
                              const rawVal = op[param.key];
                              const displayVal = typeof rawVal === 'object' ? JSON.stringify(rawVal) : (Array.isArray(rawVal) ? rawVal.join(",") : (rawVal ?? ""));
                              return (
                                <Input
                                  key={param.key}
                                  type={param.type === "number" ? "number" : "text"}
                                  placeholder={param.label}
                                  className="w-32"
                                  value={displayVal}
                                  onChange={(e) => {
                                    const newOps = [...currentRule.operations];
                                    let parsed: any = e.target.value;
                                    if (param.key === "fixedCols" || param.key === "transposeCols" || param.key === "mergeFields" || param.key === "patterns") {
                                      parsed = parsed.split(",").map((s: string) => s.trim()).filter(Boolean);
                                    } else if (param.type === "number") {
                                      parsed = Number(parsed);
                                    } else if (param.key === "rules" || param.key === "linePatterns") {
                                      try { parsed = JSON.parse(parsed); } catch { /* keep as string */ }
                                    }
                                    newOps[idx] = { ...newOps[idx], [param.key]: parsed };
                                    setCurrentRule({ ...currentRule, operations: newOps });
                                  }}
                                />
                              );
                            })}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newOps = currentRule.operations.filter((_, i) => i !== idx);
                                setCurrentRule({ ...currentRule, operations: newOps });
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentRule({ ...currentRule, operations: [...currentRule.operations, { type: "skipRows", count: 0 }] })}
                        >
                          <Plus className="w-4 h-4 mr-1" /> 添加操作
                        </Button>
                      </div>
                    </div>

                    {/* Field Mappings */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">字段映射</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {STANDARD_FIELDS.map(field => {
                          const conf = currentRule.fieldConfidence?.[field.key];
                          return (
                            <div key={field.key} className="flex items-center gap-2">
                              <span className="text-sm w-24 md:w-28 text-right flex-shrink-0 flex items-center justify-end gap-1">
                                {field.label}
                                {field.required && <span className="text-red-500">*</span>}
                                {conf === "low" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" title="低置信度" />}
                                {conf === "medium" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400" title="中等置信度" />}
                              </span>
                              <Select
                                value={currentRule.fieldMappings[field.key] || "__none__"}
                                onValueChange={(v) => {
                                  setCurrentRule({
                                    ...currentRule,
                                    fieldMappings: {
                                      ...currentRule.fieldMappings,
                                      [field.key]: v === "__none__" ? "" : v,
                                    },
                                  });
                                }}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="选择列" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-- 不映射 --</SelectItem>
                                  {currentSheetData.headers.map(h => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {aiExplanation && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-700 mb-1">AI 分析说明</p>
                        <p className="text-xs text-blue-600 whitespace-pre-wrap">{aiExplanation}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleParseWithRule} className="bg-[#0fc6c2] hover:bg-[#0bada9]">
                        <Play className="w-4 h-4 mr-1" /> 试解析
                      </Button>
                      <Button variant="outline" onClick={() => { setRuleName(currentRule.name); setShowRuleDialog(true); }}>
                        <Save className="w-4 h-4 mr-1" /> 保存规则
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rule Preview Panel */}
                {showPreview && currentRule && currentSheetData.rows.length > 0 && (
                  <RulePreview
                    rows={currentSheetData.rows}
                    headers={currentSheetData.headers}
                    rule={currentRule}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">数据预览</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {errorCount > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" /> {errorCount} 个错误
                      </Badge>
                    )}
                    {duplicateCount > 0 && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 gap-1">
                        <AlertCircle className="w-3 h-3" /> {duplicateCount} 个重复
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setStep("rule")}>
                      返回修改规则
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                      <Download className="w-4 h-4 mr-1" /> 导出
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={isSubmitting || errorCount > 0}
                      className="bg-[#0fc6c2] hover:bg-[#0bada9]"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      提交下单
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isSubmitting && (
                  <div className="mb-4">
                    <Progress value={submitProgress} className="h-2" />
                    <p className="text-sm text-gray-500 mt-1">正在提交... {submittedCount}/{orderItems.length} 条</p>
                  </div>
                )}
                <DataPreview
                  items={validatedItems}
                  onItemsChange={setOrderItems}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Save Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存解析规则</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">规则名称</label>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="输入规则名称"
              />
            </div>
            <Button
              onClick={handleSaveRule}
              disabled={!ruleName.trim()}
              className="w-full bg-[#0fc6c2] hover:bg-[#0bada9]"
            >
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
