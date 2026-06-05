"use client";

import { useState } from "react";
import { Package, List, Settings, FileUp } from "lucide-react";
import { ImportWorkflow } from "@/components/ImportWorkflow";
import { OrderList } from "@/components/OrderList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type View = "import" | "orders";

export default function Home() {
  const [view, setView] = useState<View>("import");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0e4a4a] text-white flex flex-col flex-shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-[#1a5c5c]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#0fc6c2] flex items-center justify-center text-white font-bold text-sm">
              鲸
            </div>
            <span className="font-semibold text-sm">万能导入系统</span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          <button
            onClick={() => setView("import")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              view === "import"
                ? "bg-[#166060] text-white"
                : "text-gray-300 hover:bg-[#166060] hover:text-white"
            }`}
          >
            <FileUp className="w-4 h-4" />
            导入下单
          </button>
          <button
            onClick={() => setView("orders")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              view === "orders"
                ? "bg-[#166060] text-white"
                : "text-gray-300 hover:bg-[#166060] hover:text-white"
            }`}
          >
            <List className="w-4 h-4" />
            已导入运单
          </button>
        </nav>

        <div className="p-3 border-t border-[#1a5c5c]">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-[#166060] hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            设置
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-800">
            {view === "import" ? "导入下单" : "已导入运单"}
          </h1>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0fc6c2]" />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {view === "import" ? (
            <ImportWorkflow apiKey={apiKey} />
          ) : (
            <OrderList />
          )}
        </div>
      </main>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>系统设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">DeepSeek API Key</label>
              <Input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                用于 AI 辅助生成解析规则，仅保存在本地浏览器中
              </p>
            </div>
            <Button
              onClick={() => setShowSettings(false)}
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
