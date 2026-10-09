import { useState } from "react";
import { FileText, LayoutDashboard, Link2, Monitor, Settings } from "lucide-react";
import { OverviewPage } from "@/pages/Overview";
import { MatchingPage } from "@/pages/Matching";
import { SettingsPage } from "@/pages/Settings";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, today } from "@/lib/utils";

type Tab = "overview" | "matching" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const genReport = async () => {
    setReportMsg(null);
    try {
      const r = await api.report(today());
      setReportMsg(`Отчёт сохранён`);
      console.info(r.file);
    } catch (e) {
      setReportMsg(String(e));
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 md:px-6">
          <div className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
            <Monitor className="h-5 w-5 text-[var(--color-primary)]" />
            <span className="hidden sm:inline">Screen Tracker</span>
          </div>

          <nav className="flex items-center gap-1 rounded-lg bg-[var(--color-muted)] p-1">
            <TopTab active={tab === "overview"} onClick={() => setTab("overview")}>
              <LayoutDashboard className="h-4 w-4" />
              Обзор
            </TopTab>
            <TopTab active={tab === "matching"} onClick={() => setTab("matching")}>
              <Link2 className="h-4 w-4" />
              Распределение
            </TopTab>
            <TopTab active={tab === "settings"} onClick={() => setTab("settings")}>
              <Settings className="h-4 w-4" />
              Настройки
            </TopTab>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {reportMsg && (
              <span className="hidden max-w-[200px] truncate text-xs text-[var(--color-muted-foreground)] md:inline">
                {reportMsg}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => void genReport()}>
              <FileText className="h-4 w-4" />
              Отчёт
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">
        {tab === "overview" ? (
          <OverviewPage />
        ) : tab === "matching" ? (
          <MatchingPage />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}

function TopTab({
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
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      )}
    >
      {children}
    </button>
  );
}
