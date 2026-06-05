"use client";

import { useState } from "react";
import { Package, List, Settings, FileUp, Menu, X } from "lucide-react";
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

interface SidebarContentProps {
  view: View;
  onViewChange: (view: View) => void;
  onClose: () => void;
  onSettingsClick: () => void;
}

function SidebarContent({ view, onViewChange, onClose, onSettingsClick }: SidebarContentProps) {
  return (
    <>
      <div className="h-14 flex items-center px-4 border-b border-[#1a5c5c] justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#0fc6c2] flex items-center justify-center text-white font-bold text-sm">
            鲸
          </div>
          <span className="font-semibold text-sm">万能导入系统</span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden rounded-md p-1 hover:bg-[#166060] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        <button
          onClick={() => { onViewChange("import"); onClose(); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 ${
            view === "import"
              ? "bg-[#166060] text-white shadow-sm"
              : "text-gray-300 hover:bg-[#166060] hover:text-white"
          }`}
        >
          <FileUp className="w-4 h-4 flex-shrink-0" />
          导入下单
        </button>
        <button
          onClick={() => { onViewChange("orders"); onClose(); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 ${
            view === "orders"
              ? "bg-[#166060] text-white shadow-sm"
              : "text-gray-300 hover:bg-[#166060] hover:text-white"
          }`}
        >
          <List className="w-4 h-4 flex-shrink-0" />
          已导入运单
        </button>
      </nav>

      <div className="p-3 border-t border-[#1a5c5c]">
        <button
          onClick={onSettingsClick}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-[#166060] hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          设置
        </button>
      </div>
    </>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("import");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 bg-[#0e4a4a] text-white flex-col flex-shrink-0">
        <SidebarContent view={view} onViewChange={setView} onClose={() => setSidebarOpen(false)} onSettingsClick={() => setShowSettings(true)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-[#0e4a4a] text-white flex flex-col z-50 shadow-2xl transition-transform duration-300 animate-in slide-in-from-left">
            <SidebarContent view={view} onViewChange={setView} onClose={() => setSidebarOpen(false)} onSettingsClick={() => setShowSettings(true)} />
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded-md p-1.5 hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-base font-semibold text-gray-800">
              {view === "import" ? "导入下单" : "已导入运单"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0fc6c2]" />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="animate-in fade-in duration-300" key={view}>
            {view === "import" ? (
              <ImportWorkflow apiKey={apiKey} />
            ) : (
              <OrderList />
            )}
          </div>
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
