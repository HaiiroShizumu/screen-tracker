import { useState } from "react";
import { Activity, LayoutDashboard, Link2, FileText } from "lucide-react";
import { OverviewPage } from "@/pages/Overview";
import { MatchingPage } from "@/pages/Matching";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, today } from "@/lib/utils";

type Tab = "overview" | "matching";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const genReport = async () => {
    setReportMsg(null);
    try {
      const r = await api.report(today());
      setReportMsg(`Отчёт: ${r.file}`);
    } catch (e) {
      setReportMsg(String(e));
    }
  };

  return (
    <div className="flex min-h-full">
      <aside className="flex w-60 shrink-0 flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-fg)]">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-teal-300" />
            Screen Tracker
          </div>
          <p className="mt-1 text-xs text-[var(--color-sidebar-muted)]">локально · Bitrix · MiMo</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavBtn active={tab === "overview"} onClick={() => setTab("overview")}>
            <LayoutDashboard className="h-4 w-4" />
            Обзор
          </NavBtn>
          <NavBtn active={tab === "matching"} onClick={() => setTab("matching")}>
            <Link2 className="h-4 w-4" />
            Матчинг
          </NavBtn>
        </nav>
        <div className="space-y-2 border-t border-white/10 p-3">
          <Button
            variant="outline"
            className="w-full border-white/20 bg-transparent text-[var(--color-sidebar-fg)] hover:bg-white/10"
            onClick={() => void genReport()}
          >
            <FileText className="h-4 w-4" />
            Отчёт сейчас
          </Button>
          {reportMsg && (
            <p className="break-all text-[10px] text-[var(--color-sidebar-muted)]">{reportMsg}</p>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6 md:p-8">
        {tab === "overview" ? <OverviewPage /> : <MatchingPage />}
      </main>
    </div>
  );
}

function NavBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
        active ? "bg-white/15 text-white" : "text-[var(--color-sidebar-muted)] hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
