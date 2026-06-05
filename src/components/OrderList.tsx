"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Package, FileX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface Order {
  id: number;
  external_code: string;
  store_name: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  sku_code: string;
  sku_name: string;
  sku_quantity: number;
  sku_spec: string;
  remark: string;
  created_at: string;
}

export function OrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [size] = useState(10);
  const [total, setTotal] = useState(0);
  const [externalCode, setExternalCode] = useState("");
  const [receiverName, setReceiverName] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("size", String(size));
      if (externalCode) params.set("externalCode", externalCode);
      if (receiverName) params.set("receiverName", receiverName);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
        setTotal(data.pagination.total);
      }
    } catch (e) {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [page, size, externalCode, receiverName]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const totalPages = Math.ceil(total / size);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-5 h-5 text-[#0fc6c2]" />
          已导入运单列表
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="外部编码"
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            className="w-36 md:w-48"
          />
          <Input
            placeholder="收件人姓名"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            className="w-36 md:w-48"
          />
          <Button onClick={() => { setPage(1); fetchOrders(); }}>
            <Search className="w-4 h-4 mr-1" /> 查询
          </Button>
          <Button variant="outline" onClick={() => { setExternalCode(""); setReceiverName(""); setPage(1); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 重置
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#e8fafa]">
                <TableHead className="text-[#0b6e6e]">外部编码</TableHead>
                <TableHead className="text-[#0b6e6e]">收货门店</TableHead>
                <TableHead className="text-[#0b6e6e]">收件人</TableHead>
                <TableHead className="text-[#0b6e6e]">电话</TableHead>
                <TableHead className="text-[#0b6e6e]">地址</TableHead>
                <TableHead className="text-[#0b6e6e]">SKU编码</TableHead>
                <TableHead className="text-[#0b6e6e]">SKU名称</TableHead>
                <TableHead className="text-[#0b6e6e]">数量</TableHead>
                <TableHead className="text-[#0b6e6e]">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Loader2 className="w-8 h-8 animate-spin text-[#0fc6c2]" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <FileX className="w-10 h-10" />
                      <span className="text-sm">暂无数据</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs">{order.external_code || "-"}</TableCell>
                    <TableCell className="text-xs">{order.store_name || "-"}</TableCell>
                    <TableCell className="text-xs">{order.receiver_name || "-"}</TableCell>
                    <TableCell className="text-xs">{order.receiver_phone || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{order.receiver_address || "-"}</TableCell>
                    <TableCell className="text-xs">{order.sku_code}</TableCell>
                    <TableCell className="text-xs">{order.sku_name}</TableCell>
                    <TableCell className="text-xs">{order.sku_quantity}</TableCell>
                    <TableCell className="text-xs">{order.created_at}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            共 {total} 条，第 {page} / {totalPages || 1} 页
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
