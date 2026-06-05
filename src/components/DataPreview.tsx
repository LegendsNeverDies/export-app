"use client";

import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, ChevronDown, ChevronRight, Pencil, X, Check, Search } from "lucide-react";
import { OrderItem } from "@/lib/types";

interface DataPreviewProps {
  items: OrderItem[];
  onItemsChange?: (items: OrderItem[]) => void;
}

const COLUMNS = [
  { key: "externalCode", label: "外部编码", width: "w-28" },
  { key: "storeName", label: "收货门店", width: "w-44" },
  { key: "receiverName", label: "收件人", width: "w-24" },
  { key: "receiverPhone", label: "电话", width: "w-28" },
  { key: "receiverAddress", label: "地址", width: "w-56" },
  { key: "skuCode", label: "SKU编码", width: "w-28" },
  { key: "skuName", label: "SKU名称", width: "w-40" },
  { key: "skuQuantity", label: "数量", width: "w-16" },
  { key: "skuSpec", label: "规格", width: "w-28" },
  { key: "remark", label: "备注", width: "w-28" },
];

export function DataPreview({ items, onItemsChange }: DataPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filterText, setFilterText] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const groupKey = (item: OrderItem) => item.externalCode || item.storeName || `row-${item._rowIndex}`;

  const groupedItems = useMemo(() => {
    const groups: { key: string; items: OrderItem[] }[] = [];
    let currentGroup: { key: string; items: OrderItem[] } | null = null;

    filteredItems.forEach(item => {
      const key = groupKey(item);
      if (!currentGroup || currentGroup.key !== key) {
        currentGroup = { key, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    });
    return groups;
  }, [filteredItems]);

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

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const toggleRow = useCallback((idx: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const getCellValue = (item: OrderItem, field: string) => {
    return (item as any)[field] ?? "";
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索 SKU、门店、收件人..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <span className="text-sm text-gray-500">
          {filteredItems.length} 条数据 / 已选 {selectedRows.size} 行
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Header */}
        <div className="flex bg-[#e8fafa] border-b text-xs font-medium text-[#0b6e6e]">
          <div className="w-8 flex-shrink-0 px-2 py-2 flex items-center justify-center">
            <Checkbox
              checked={selectedRows.size === filteredItems.length && filteredItems.length > 0}
              onCheckedChange={(checked) => {
                if (checked) setSelectedRows(new Set(filteredItems.map((_, i) => i)));
                else setSelectedRows(new Set());
              }}
            />
          </div>
          {COLUMNS.map(col => (
            <div key={col.key} className={`${col.width} flex-shrink-0 px-2 py-2 truncate`}>
              {col.label}
            </div>
          ))}
          <div className="w-12 flex-shrink-0" />
        </div>

        {/* Rows */}
        <ScrollArea className="max-h-[500px]">
          {groupedItems.map(group => {
            const isCollapsed = collapsedGroups.has(group.key);
            const groupErrors = group.items.filter(i => i._errors && Object.keys(i._errors).length > 0).length;

            return (
              <div key={group.key}>
                {/* Group header */}
                <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b text-xs text-gray-600 cursor-pointer"
                  onClick={() => toggleGroup(group.key)}>
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="font-medium">{group.key || '(无分组)'}</span>
                  <span className="text-gray-400">({group.items.length}项)</span>
                  {groupErrors > 0 && (
                    <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">
                      {groupErrors}错误
                    </Badge>
                  )}
                </div>

                {/* Group rows */}
                {!isCollapsed && group.items.map((item, localIdx) => {
                  const globalIdx = filteredItems.indexOf(item);
                  const hasErrors = item._errors && Object.keys(item._errors).length > 0;
                  const isEditing = editingCell?.rowIdx === globalIdx;
                  const isSelected = selectedRows.has(globalIdx);

                  return (
                    <div
                      key={`${group.key}-${localIdx}`}
                      className={`flex items-center border-b text-xs hover:bg-gray-50 ${
                        hasErrors ? 'bg-red-50' : isSelected ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-8 flex-shrink-0 px-2 py-1.5 flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(globalIdx)}
                        />
                      </div>

                      {COLUMNS.map(col => (
                        <div
                          key={col.key}
                          className={`${col.width} flex-shrink-0 px-2 py-1.5 truncate`}
                        >
                          {isEditing && editingCell?.field === col.key ? (
                            <Input
                              className="h-5 text-xs px-1"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                              type={col.key === 'skuQuantity' ? 'number' : 'text'}
                            />
                          ) : (
                            <div
                              className="flex items-center gap-1 group cursor-pointer"
                              onDoubleClick={() => onItemsChange && startEdit(globalIdx, col.key, String(getCellValue(item, col.key)))}
                            >
                              <span className="truncate flex-1">{getCellValue(item, col.key) || '-'}</span>
                              {onItemsChange && (
                                <Pencil className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="w-12 flex-shrink-0 px-2 py-1.5 flex items-center justify-center">
                        {hasErrors && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="space-y-1">
                                {Object.entries(item._errors || {}).map(([field, msg]) => (
                                  <p key={field} className="text-red-600">{String(msg)}</p>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </ScrollArea>
      </div>
    </div>
  );
}
