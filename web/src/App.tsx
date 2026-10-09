import { useEffect, useState } from "react";
import { Activity, FileText, LayoutDashboard, Link2, ShieldAlert } from "lucide-react";
import { OverviewPage } from "@/pages/Overview";
import { MatchingPage } from "@/pages/Matching";
import { Button, Card } from "@/components/ui";
import { api, type PermissionStatus } from "@/lib/api";
import { cn, today } from "@/lib/utils";

type Tab = "overview" | "matching";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [perms, setPerms] = useState<PermissionStatus | null>(null);
  const [hidePerm, setHidePerm] = useState(false);

  const loadPerms = () =>
    api
      .permissions()
      .then(setPerms)
      .catch(() => setPerms(null));

  useEffect(() => {
    void loadPerms();
    const t = setInterval(() => void loadPerms(), 60_000);
    return () => clearInterval(t);
  }, []);

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

  const openSettings = () => {
    window.open(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
      "_blank"
    );
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 md:px-6">
          <div className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-[var(--color-primary)]" />
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
        {perms && !perms.ok && !hidePerm && (
          <Card className="mb-6 flex flex-wrap items-start gap-3 border-[var(--color-border)] p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Нужны права macOS (Автоматизация)</div>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Без доступа не пишутся URL сайтов. Сейчас не хватает:{" "}
                <span className="font-medium text-[var(--color-foreground)]">
                  {perms.missing.join(", ")}
                </span>
                . Включи галочки для Screen Tracker / Electron → Chrome, Safari, Arc, System Events.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={openSettings}>
                Открыть настройки
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHidePerm(true)}>
                Скрыть
              </Button>
            </div>
          </Card>
        )}
        {tab === "overview" ? <OverviewPage /> : <MatchingPage />}
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
