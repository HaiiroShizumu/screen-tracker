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
import { api, type Overview as OverviewData, type RangePreset } from "@/lib/api";
import { formatDuration, today } from "@/lib/utils";
import { Badge, Button, Card, Select } from "@/components/ui";

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

  const daySpan = useMemo(() => {
    if (!data?.timeline.length) return { start: 0, end: 1 };
    const times = data.timeline.flatMap((t) => [
      new Date(t.ts_start).getTime(),
      new Date(t.ts_end).getTime(),
    ]);
    return { start: Math.min(...times), end: Math.max(...times) };
  }, [data]);

  const chartData = (rows: { name: string; seconds: number }[]) =>
    rows.map((r) => ({
      name: r.name.length > 18 ? r.name.slice(0, 16) + "…" : r.name,
      hours: Math.round((r.seconds / 3600) * 100) / 100,
      minutes: Math.round(r.seconds / 60),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Активность за ПК и привязка к задачам
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
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
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Активно" value={formatDuration(data?.kpi.active_sec || 0)} hint="без idle" />
        <Kpi title="Idle" value={formatDuration(data?.kpi.idle_sec || 0)} hint="без ввода" />
        <Kpi title="Matched" value={`${data?.kpi.match_pct ?? 0}%`} hint="день в матчинге" />
        <Kpi
          title="Топ задача"
          value={data?.kpi.top_task || "—"}
          hint={data?.kpi.top_task_sec ? formatDuration(data.kpi.top_task_sec) : ""}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="По приложениям" data={chartData(data?.byApp || [])} color="var(--color-chart-1)" />
        <ChartCard title="По доменам" data={chartData(data?.byDomain || [])} color="var(--color-chart-2)" />
        <ChartCard title="По задачам" data={chartData(data?.byTask || [])} color="var(--color-chart-3)" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Timeline</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">{day}</p>
          </div>
          <Badge>{data?.timeline.length || 0} сегментов</Badge>
        </div>
        <div className="relative h-28 overflow-hidden rounded-lg bg-[var(--color-muted)]">
          {(data?.timeline || []).map((seg) => {
            const left =
              ((new Date(seg.ts_start).getTime() - daySpan.start) /
                Math.max(1, daySpan.end - daySpan.start)) *
              100;
            const width =
              ((new Date(seg.ts_end).getTime() - new Date(seg.ts_start).getTime()) /
                Math.max(1, daySpan.end - daySpan.start)) *
              100;
            return (
              <div
                key={seg.id}
                title={`${seg.app} ${seg.domain || ""} ${formatDuration(seg.duration_sec)}`}
                className="absolute top-3 bottom-3 rounded-md bg-[var(--color-primary)]/80 hover:bg-[var(--color-accent)]"
                style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
              />
            );
          })}
        </div>
        <div className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">
          {(data?.timeline || []).slice(0, 40).map((seg) => (
            <div
              key={seg.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-2 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {seg.domain || seg.app}
                  {seg.title ? ` — ${seg.title}` : ""}
                </div>
                <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                  {new Date(seg.ts_start).toLocaleTimeString()} –{" "}
                  {new Date(seg.ts_end).toLocaleTimeString()}
                </div>
              </div>
              <span className="shrink-0 text-[var(--color-muted-foreground)]">
                {formatDuration(seg.duration_sec)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-[var(--color-muted-foreground)]">{title}</div>
      <div className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{hint}</div> : null}
    </Card>
  );
}

function ChartCard({
  title,
  data,
  color,
}: {
  title: string;
  data: { name: string; hours: number; minutes: number }[];
  color: string;
}) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number, _n, p) => [
                `${v} ч (${(p?.payload as { minutes: number })?.minutes || 0} м)`,
                "время",
              ]}
            />
            <Bar dataKey="hours" fill={color} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
