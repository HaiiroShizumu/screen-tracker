import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { api, type Overview as OverviewData, type RangePreset } from "@/lib/api";
import { formatDuration, today } from "@/lib/utils";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { ActivityTimeline } from "@/components/ActivityTimeline";

export function OverviewPage() {
  const [range, setRange] = useState<RangePreset>("day");
  const [day, setDay] = useState(today());
  const [data, setData] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await api.overview(range, day));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [range, day]);

  const areaData = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const seg of data?.timeline || []) {
      const d = new Date(seg.ts_start);
      const key =
        range === "day"
          ? `${String(d.getHours()).padStart(2, "0")}:${d.getMinutes() < 30 ? "00" : "30"}`
          : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) || 0) + seg.duration_sec / 60);
    }

    // Always fill 09:00–18:00 in 30-min steps
    if (range === "day") {
      const out: { name: string; minutes: number }[] = [];
      for (let m = 9 * 60; m <= 18 * 60; m += 30) {
        const name = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        out.push({ name, minutes: Math.round((buckets.get(name) || 0) * 10) / 10 });
      }
      return out;
    }

    const days = range === "week" ? 7 : 30;
    const out: { name: string; minutes: number }[] = [];
    const anchor = new Date(`${day}T12:00:00`);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const name = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ name, minutes: Math.round((buckets.get(name) || 0) * 10) / 10 });
    }
    return out;
  }, [data, range, day]);

  const focusRows = useMemo(() => {
    const sites = (data?.byDomain || [])
      .filter((r) => {
        const n = r.name.toLowerCase();
        return n && n !== "(no url)" && !n.includes("newtab");
      })
      .map((r) => ({
        name: r.name,
        seconds: r.seconds,
        kind: "site" as const,
      }));

    const projects = (data?.byApp || [])
      .filter((r) => /^(Cursor|Code)\s·\s/.test(r.name))
      .map((r) => ({
        name: r.name.replace(/^(Cursor|Code)\s·\s/, ""),
        seconds: r.seconds,
        kind: "project" as const,
        editor: r.name.startsWith("Code") ? "Code" : "Cursor",
      }));

    const merged = [...sites, ...projects].sort((a, b) => b.seconds - a.seconds);
    const total = merged.reduce((s, r) => s + r.seconds, 0) || 1;
    return merged.slice(0, 10).map((r) => {
      const editor = r.kind === "project" ? (r as { editor?: string }).editor || "Cursor" : null;
      return {
        ...r,
        timeLabel: r.seconds < 60 ? `${r.seconds}с` : `${Math.round(r.seconds / 60)}м`,
        pct: Math.round((r.seconds / total) * 100),
        label: editor ? `${editor} · ${r.name}` : r.name,
      };
    });
  }, [data]);

  const appBars = useMemo(
    () =>
      (data?.byApp || [])
        .filter((r) => r.name.toLowerCase() !== "unknown")
        .slice(0, 8)
        .map((r) => ({
          name: r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name,
          minutes: Math.round(r.seconds / 60),
        })),
    [data]
  );

  const activeMin = Math.round((data?.kpi.active_sec || 0) / 60);
  const idleMin = Math.round((data?.kpi.idle_sec || 0) / 60);
  const matchPct = data?.kpi.match_pct ?? 0;
  const segments = data?.timeline.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Здесь — что ты делал за ПК и как это бьётся с задачами.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <Select value={range} onChange={(e) => setRange(e.target.value as RangePreset)}>
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </Select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Обновить
          </Button>
        </div>
      </div>

      {err && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {err}
        </Card>
      )}

      {/* Top charts row — like Budgets + Visitors */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-1 font-semibold tracking-tight">Активность по времени</div>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Минуты фокуса {range === "day" ? "по часам" : "по дням"}
          </p>
          <div className="h-64">
            {areaData.every((d) => d.minutes === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                Нет данных за выбранный период
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    interval={range === "day" ? 1 : 0}
                    minTickGap={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-foreground)",
                    }}
                    labelStyle={{ color: "var(--color-muted-foreground)" }}
                    formatter={(v: number) => [`${v} мин`, "фокус"]}
                  />
                  <Bar
                    dataKey="minutes"
                    fill="var(--color-foreground)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={range === "day" ? 14 : 28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <TrendingUp className="h-4 w-4 text-[var(--color-success)]" />
            Matched {matchPct}% · {formatDuration(data?.kpi.active_sec || 0)} активно
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-1 font-semibold tracking-tight">Сайты и проекты</div>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Домены браузера и папки Cursor / VS Code
          </p>
          {focusRows.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              Пока нет сайтов и проектов
            </div>
          ) : (
            <div className="flex max-h-64 flex-col gap-3 overflow-auto pr-1">
              {focusRows.map((d) => (
                <div key={`${d.kind}:${d.label}`} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate font-medium" title={d.label}>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] bg-[var(--color-muted)]"
                      >
                        {d.kind === "project" ? "IDE" : "WEB"}
                      </span>
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">
                      {d.timeLabel} · {d.pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-foreground)]"
                      style={{ width: `${Math.max(d.pct, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* KPI row — Session / Page Views style */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Активно" value={String(activeMin)} suffix="мин" hint="без idle" pct={matchPct} />
        <KpiCard title="Idle" value={String(idleMin)} suffix="мин" hint="без ввода" pct={Math.min(100, idleMin)} invert />
        <KpiCard title="Matched" value={`${matchPct}`} suffix="%" hint="назначено задачам" pct={matchPct} />
        <KpiCard
          title="Сегменты"
          value={String(segments)}
          suffix=""
          hint={data?.kpi.top_task ? `топ: ${data.kpi.top_task}` : "за день"}
          pct={Math.min(100, segments)}
        />
      </div>

      <ActivityTimeline day={day} segments={data?.timeline || []} />

      <Card className="p-5">
        <div className="mb-1 font-semibold tracking-tight">По приложениям</div>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Время в минутах за выбранный период
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={appBars} layout="vertical" margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: "var(--color-foreground)",
                  }}
                  labelStyle={{ color: "var(--color-muted-foreground)" }}
                  formatter={(v: number) => [`${v} мин`, "время"]}
                />
                <Bar dataKey="minutes" fill="var(--color-foreground)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  suffix,
  hint,
  pct,
  invert,
}: {
  title: string;
  value: string;
  suffix: string;
  hint: string;
  pct: number;
  invert?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <Badge tone={!invert && pct >= 50 ? "good" : "neutral"}>%{Math.round(pct)}</Badge>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
        {suffix ? <span className="text-sm text-[var(--color-muted-foreground)]">{suffix}</span> : null}
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{hint}</p>
    </Card>
  );
}
