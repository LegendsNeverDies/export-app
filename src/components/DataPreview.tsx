"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, ChevronRight, Pencil, Search, FileX, Trash2, Plus } from "lucide-react";
import { OrderItem } from "@/lib/types";

interface DataPreviewProps {
  items: OrderItem[];
  onItemsChange?: (items: OrderItem[]) => void;
}

const COLUMNS = [
  { key: "externalCode", label: "外部编码", width: 112 },
  { key: "storeName", label: "收货门店", width: 176 },
  { key: "receiverName", label: "收件人", width: 96 },
  { key: "receiverPhone", label: "电话", width: 112 },
  { key: "receiverAddress", label: "地址", width: 224 },
  { key: "skuCode", label: "SKU编码", width: 112 },
  { key: "skuName", label: "SKU名称", width: 160 },
  { key: "skuQuantity", label: "数量", width: 64 },
  { key: "skuSpec", label: "规格", width: 112 },
  { key: "remark", label: "备注", width: 112 },
] as const;

const COL_TOTAL_WIDTH = COLUMNS.reduce((s, c) => s + c.width, 0) + 44 + 32;

interface VRow {
  type: 'group' | 'data';
  key: string;
  groupKey: string;
  item?: OrderItem;
  globalIdx?: number;
  groupName?: string;
  groupCount?: number;
  groupErrors?: number;
}

export function DataPreview({ items, onItemsChange }: DataPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filterText, setFilterText] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const groupKey = (item: OrderItem) => item.externalCode || item.storeName || `row-${item._rowIndex}`;

  const filteredItems = useMemo(() => {
    if (!filterText) return items;
    const lower = filterText.toLowerCase();
    return items.filter(item =>
      item.skuCode?.toLowerCase().includes(lower) ||
      item.skuName?.toLowerCase().includes(lower) ||
      item.storeName?.toLowerCase().includes(lower) ||
      item.receiverName?.toLowerCase().includes(lower)
    );
  }, [items, filterText]);

  const vRows = useMemo((): VRow[] => {
    const rows: VRow[] = [];
    let currentGroupKey = "";
    let groupItems: OrderItem[] = [];

    const flushGroup = () => {
      if (groupItems.length > 0 && currentGroupKey) {
        const errors = groupItems.filter(i => i._errors && Object.keys(i._errors).length > 0).length;
        rows.push({
          type: 'group', key: `g-${currentGroupKey}`, groupKey: currentGroupKey,
          groupName: currentGroupKey, groupCount: groupItems.length, groupErrors: errors,
        });
        if (!collapsedGroups.has(currentGroupKey)) {
          groupItems.forEach(item => {
            const gi = filteredItems.indexOf(item);
            rows.push({ type: 'data', key: `d-${gi}`, groupKey: currentGroupKey, item, globalIdx: gi });
          });
        }
      }
      groupItems = [];
    };

    filteredItems.forEach(item => {
      const key = groupKey(item);
      if (key !== currentGroupKey) {
        flushGroup();
        currentGroupKey = key;
        groupItems = [item];
      } else {
        groupItems.push(item);
      }
    });
    flushGroup();
    return rows;
  }, [filteredItems, collapsedGroups]);

  const virtualizer = useVirtualizer({
    count: vRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });

  const startEdit = useCallback((rowIdx: number, field: string, value: string) => {
    setEditingCell({ rowIdx, field });
    setEditValue(value ?? "");
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell || !onItemsChange) return;
    const newItems = [...items];
    const item = newItems[editingCell.rowIdx];
    if (item) {
      (item as any)[editingCell.field] = editingCell.field === 'skuQuantity'
        ? parseFloat(editValue) || 0
        : editValue;
      onItemsChange(newItems);
    }
    setEditingCell(null);
  }, [editingCell, editValue, items, onItemsChange]);

  const navigateEdit = useCallback((direction: 'next' | 'prev' | 'down' | 'up') => {
    if (!editingCell || !onItemsChange) { setEditingCell(null); return; }
    const newItems = [...items];
    const item = newItems[editingCell.rowIdx];
    if (item) {
      (item as any)[editingCell.field] = editingCell.field === 'skuQuantity'
        ? parseFloat(editValue) || 0
        : editValue;
      onItemsChange(newItems);
    }
    const currentColIdx = COLUMNS.findIndex(c => c.key === editingCell.field);
    const rowIdx = editingCell.rowIdx;
    let nextRow = rowIdx;
    let nextCol = currentColIdx;
    if (direction === 'next' && currentColIdx < COLUMNS.length - 1) nextCol = currentColIdx + 1;
    else if (direction === 'next') { nextRow = Math.min(rowIdx + 1, filteredItems.length - 1); nextCol = 0; }
    else if (direction === 'prev' && currentColIdx > 0) nextCol = currentColIdx - 1;
    else if (direction === 'prev') { nextRow = Math.max(rowIdx - 1, 0); nextCol = COLUMNS.length - 1; }
    else if (direction === 'down') nextRow = Math.min(rowIdx + 1, filteredItems.length - 1);
    else if (direction === 'up') nextRow = Math.max(rowIdx - 1, 0);
    if (nextRow !== rowIdx || nextCol !== currentColIdx) {
      const nextField = COLUMNS[nextCol].key;
      setEditingCell({ rowIdx: nextRow, field: nextField });
      setEditValue(String((filteredItems[nextRow] as any)[nextField] ?? ""));
    } else {
      setEditingCell(null);
    }
  }, [editingCell, editValue, items, onItemsChange, filteredItems]);

  const cancelEdit = useCallback(() => { setEditingCell(null); setEditValue(""); }, []);

  const toggleRow = useCallback((idx: number) => {
    setSelectedRows(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  // 删除选中行
  const handleDeleteSelected = useCallback(() => {
    if (!onItemsChange || selectedRows.size === 0) return;
    const newItems = items.filter((_, idx) => !selectedRows.has(idx));
    onItemsChange(newItems);
    setSelectedRows(new Set());
  }, [items, selectedRows, onItemsChange]);

  // 新增空行
  const handleAddRow = useCallback(() => {
    if (!onItemsChange) return;
    const newRow: OrderItem = {
      id: `row-${items.length}`,
      skuCode: '',
      skuName: '',
      skuQuantity: 0,
    };
    onItemsChange([...items, newRow]);
  }, [items, onItemsChange]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <FileX className="w-12 h-12" />
        <p className="text-sm">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="搜索 SKU、门店、收件人..." value={filterText}
            onChange={e => setFilterText(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <span className="text-sm text-gray-500">
          {filteredItems.length} 条数据 / 已选 {selectedRows.size} 行
        </span>
        {onItemsChange && (
          <>
            <Button variant="outline" size="sm" onClick={handleAddRow}>
              <Plus className="w-3 h-3 mr-1" /> 新增行
            </Button>
            {selectedRows.size > 0 && (
              <Button variant="outline" size="sm" onClick={handleDeleteSelected} className="text-red-600 hover:text-red-700">
                <Trash2 className="w-3 h-3 mr-1" /> 删除选中({selectedRows.size})
              </Button>
            )}
          </>
        )}
      </div>

      {/* Virtual Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Sticky Header */}
        <div className="flex bg-[#e8fafa] border-b text-xs font-medium text-[#0b6e6e] sticky top-0 z-10" style={{ minWidth: COL_TOTAL_WIDTH }}>
          <div className="flex-shrink-0 px-2 py-2 flex items-center justify-center" style={{ width: 32 }}>
            <Checkbox checked={selectedRows.size === filteredItems.length && filteredItems.length > 0}
              onCheckedChange={c => c ? setSelectedRows(new Set(filteredItems.map((_, i) => i))) : setSelectedRows(new Set())} />
          </div>
          {COLUMNS.map(col => (
            <div key={col.key} className="flex-shrink-0 px-2 py-2 truncate" style={{ width: col.width }}>{col.label}</div>
          ))}
          <div className="flex-shrink-0" style={{ width: 44 }} />
        </div>

        {/* Virtual Scroll Body */}
        <div ref={scrollRef} className="max-h-[500px] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: COL_TOTAL_WIDTH }}>
            {virtualizer.getVirtualItems().map(vRow => {
              const row = vRows[vRow.index];
              if (!row) return null;

              if (row.type === 'group') {
                return (
                  <div key={row.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
                    className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleGroup(row.groupKey)}>
                    {collapsedGroups.has(row.groupKey) ? <ChevronRight className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                    <span className="font-medium truncate">{row.groupName || '(无分组)'}</span>
                    <span className="text-gray-400 flex-shrink-0">({row.groupCount}项)</span>
                    {(row.groupErrors ?? 0) > 0 && (
                      <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">{row.groupErrors}错误</Badge>
                    )}
                  </div>
                );
              }

              const item = row.item!;
              const gi = row.globalIdx!;
              const hasErrors = item._errors && Object.keys(item._errors).length > 0;
              const isEditing = editingCell?.rowIdx === gi;
              const isSelected = selectedRows.has(gi);

              return (
                <div key={row.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
                  className={`flex items-center border-b text-xs hover:bg-gray-50 ${hasErrors ? 'bg-red-50' : isSelected ? 'bg-blue-50' : ''}`}>
                  <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-center" style={{ width: 32 }}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(gi)} />
                  </div>
                  {COLUMNS.map(col => (
                    <div key={col.key} className="flex-shrink-0 px-2 py-1.5 truncate" style={{ width: col.width }}>
                      {isEditing && editingCell?.field === col.key ? (
                        <Input className="h-5 text-xs px-1" value={editValue}
                          onChange={e => setEditValue(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); navigateEdit('down'); }
                            else if (e.key === 'Tab') { e.preventDefault(); navigateEdit(e.shiftKey ? 'prev' : 'next'); }
                            else if (e.key === 'Escape') cancelEdit();
                          }} autoFocus type={col.key === 'skuQuantity' ? 'number' : 'text'} />
                      ) : (
                        <div className="flex items-center gap-1 group cursor-pointer"
                          onDoubleClick={() => onItemsChange && startEdit(gi, col.key, String((item as any)[col.key] ?? ""))}>
                          <span className="truncate flex-1">{((item as any)[col.key] ?? '') || '-'}</span>
                          {onItemsChange && <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-center" style={{ width: 44 }}>
                    {hasErrors && (
                      <Tooltip>
                        <TooltipTrigger><AlertCircle className="w-3.5 h-3.5 text-red-500" /></TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="space-y-1">
                            {Object.entries(item._errors || {}).map(([field, msg]) => (
                              <p key={field} className="text-red-600">{String(msg)}</p>
                            ))}
                            {item._duplicateWith && item._duplicateWith.length > 0 && (
                              <p className="text-orange-600">与第 {item._duplicateWith.map(i => i + 1).join(', ')} 行重复</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
