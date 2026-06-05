"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Upload, FileSpreadsheet, FileText, Sparkles, Play, Save, Download, Trash2, Plus, AlertCircle, CheckCircle, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { applyRule, validateOrderItems } from "@/lib/rule-engine";
import { ParseRule, OrderItem, ParsedFile } from "@/lib/types";
import { DataPreview } from "./DataPreview";

interface ImportWorkflowProps {
  apiKey: string;
}

const STANDARD_FIELDS = [
  { key: "externalCode", label: "外部编码" },
  { key: "storeName", label: "收货门店" },
  { key: "receiverName", label: "收件人姓名" },
  { key: "receiverPhone", label: "收件人电话" },
  { key: "receiverAddress", label: "收件人地址" },
  { key: "skuCode", label: "SKU物品编码" },
  { key: "skuName", label: "SKU物品名称" },
  { key: "skuQuantity", label: "SKU发货数量" },
  { key: "skuSpec", label: "SKU规格型号" },
  { key: "remark", label: "备注" },
];

const OPERATION_TYPES = [
  { value: "skipRows", label: "跳过前N行", params: [{ key: "count", label: "行数", type: "number" }] },
  { value: "headerRow", label: "表头所在行", params: [{ key: "rowIndex", label: "行索引(0-based)", type: "number" }] },
  { value: "footerSkipRows", label: "跳过尾部N行", params: [{ key: "count", label: "行数", type: "number" }] },
  { value: "aggregateBy", label: "按字段聚合", params: [{ key: "keyField", label: "聚合字段", type: "text" }] },
  { value: "filterEmptyRows", label: "过滤空行", params: [] },
  { value: "skipTotalRows", label: "跳过合计行", params: [] },
];

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [ruleName, setRuleName] = useState("");
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
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setParsedData(data.data);
      setCurrentSheet(0);
      setStep("rule");
      await loadRules();
      toast.success(`成功解析文件，共 ${data.data.length} 个Sheet`);
    } catch (err: any) {
      toast.error(err.message || "文件解析失败");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleAIAnalyze = async () => {
    if (!apiKey) {
      toast.error("请先配置 DeepSeek API Key");
      return;
    }
    if (!currentSheetData.headers.length) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file?.name,
          headers: currentSheetData.headers,
          sampleRows: currentSheetData.rows.slice(0, 5),
          apiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRule(data.data.rule);
        toast.success("AI 分析完成，请检查规则配置");
      } else {
        toast.error(data.message || "AI 分析失败");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleParseWithRule = () => {
    if (!currentRule || !currentSheetData.rows.length) return;

    try {
      const allRows = parsedData.flatMap((sheet, idx) => {
        if (currentRule.operations.some((op: any) => op.type === "multiSheet")) {
          return sheet.rows.map(r => ({ ...r, _sheetIndex: idx }));
        }
        return idx === currentSheet ? sheet.rows : [];
      });

      const result = applyRule(allRows, currentSheetData.headers, currentRule);
      setOrderItems(result.items);
      setStep("preview");
      toast.success(`解析完成，共 ${result.items.length} 条数据`);
    } catch (err: any) {
      toast.error(err.message || "解析失败");
    }
  };

  const handleSaveRule = async () => {
    if (!currentRule || !ruleName.trim()) return;
    try {
      const ruleToSave = { ...currentRule, name: ruleName };
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          fileType: ruleToSave.fileType || "excel",
          operations: ruleToSave.operations,
          fieldMappings: ruleToSave.fieldMappings,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("规则保存成功");
        setShowRuleDialog(false);
        await loadRules();
      } else {
        toast.error(data.message);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSubmit = async () => {
    const validItems = orderItems.filter(item => !item._errors || Object.keys(item._errors).length === 0);
    if (validItems.length === 0) {
      toast.error("没有可提交的数据，请先修正错误");
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress(0);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: validItems }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setStep("upload");
        setFile(null);
        setParsedData([]);
        setOrderItems([]);
      } else {
        toast.error(data.message);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(100);
    }
  };

  const handleExport = () => {
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

    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `导入数据_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const validatedItems = useMemo(() => {
    return validateOrderItems(orderItems);
  }, [orderItems]);

  const errorCount = validatedItems.filter(item => item._errors && Object.keys(item._errors).length > 0).length;
  const duplicateCount = validatedItems.filter(item => item._duplicateWith && item._duplicateWith.length > 0).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {["上传文件", "配置规则", "数据预览", "提交下单"].map((label, idx) => {
          const steps: Array<"upload" | "rule" | "preview" | "submit"> = ["upload", "rule", "preview", "submit"];
          const currentIdx = steps.indexOf(step);
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
                isActive ? "bg-[#0fc6c2] text-white" : isDone ? "bg-[#e8fafa] text-[#0b6e6e]" : "bg-gray-100 text-gray-500"
              }`}>
                {isDone ? <CheckCircle className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-xs">{idx + 1}</span>}
                {label}
              </div>
              {idx < 3 && <div className={`w-8 h-px ${isDone ? "bg-[#0fc6c2]" : "bg-gray-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
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
                accept=".xlsx,.xls,.pdf,.docx,.doc"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-base font-medium text-gray-700">点击或拖拽文件至此处上传</p>
              <p className="text-sm text-gray-500 mt-2">支持 Excel、Word、PDF 格式</p>
            </div>
            {isParsing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-[#0fc6c2]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>正在解析文件...</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rule Step */}
      {step === "rule" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">文件信息</CardTitle>
                <div className="flex gap-2">
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">选择或配置解析规则</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAIAnalyze}
                    disabled={isAnalyzing || !apiKey}
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                    AI 辅助生成
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Rule Selection */}
              <div className="flex gap-2">
                <Select
                  value={selectedRuleId ? String(selectedRuleId) : ""}
                  onValueChange={(v) => {
                    const rule = rules.find(r => r.id === Number(v));
                    if (rule) {
                      setSelectedRuleId(rule.id!);
                      setCurrentRule(rule);
                    }
                  }}
                >
                  <SelectTrigger className="w-72">
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
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> 新建规则
                </Button>
              </div>

              {/* Rule Configuration */}
              {currentRule && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                          <SelectItem value="word">Word</SelectItem>
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
                        <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
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
                          {OPERATION_TYPES.find(t => t.value === op.type)?.params.map((param: any) => (
                            <Input
                              key={param.key}
                              type={param.type}
                              placeholder={param.label}
                              className="w-32"
                              value={op[param.key] || ""}
                              onChange={(e) => {
                                const newOps = [...currentRule.operations];
                                newOps[idx] = { ...newOps[idx], [param.key]: param.type === "number" ? Number(e.target.value) : e.target.value };
                                setCurrentRule({ ...currentRule, operations: newOps });
                              }}
                            />
                          ))}
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
                    <div className="grid grid-cols-2 gap-2">
                      {STANDARD_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-sm w-28 text-right">{field.label}:</span>
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
                      ))}
                    </div>
                  </div>

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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">数据预览</CardTitle>
                <div className="flex items-center gap-2">
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
                  <p className="text-sm text-gray-500 mt-1">正在提交...</p>
                </div>
              )}
              <DataPreview
                items={validatedItems}
                onItemsChange={setOrderItems}
              />
            </CardContent>
          </Card>
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
