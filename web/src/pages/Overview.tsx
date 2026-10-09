import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { api, type Overview as OverviewData } from "@/lib/api";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Category,
} from "@/lib/categories";
import { formatDuration, today } from "@/lib/utils";
import { Button, Card } from "@/components/ui";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DatePicker } from "@/components/date-picker";

const COMPANY_COLORS = [
  "var(--color-cat-code)",
  "var(--color-cat-research)",
  "var(--color-cat-ai)",
  "var(--color-cat-comms)",
  "var(--color-cat-other)",
  "#f472b6",
  "#a3e635",
  "#38bdf8",
];

export function OverviewPage() {
  const [day, setDay] = useState(today());
  const [data, setData] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await api.overview("day", day));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [day]);

  const stackedData = useMemo(() => {
    if (data?.hourlyStacked?.length) return data.hourlyStacked;
    return [];
  }, [data]);

  const hasStacked = stackedData.some((row) =>
    CATEGORY_ORDER.some((c) => Number(row[c] || 0) > 0)
  );

  const donutData = useMemo(
    () =>
      (data?.byCategory || []).map((c) => ({
        name: c.name,
        id: c.id,
        seconds: c.seconds,
        minutes: Math.round(c.seconds / 60),
      })),
    [data]
  );

  const donutTotal = donutData.reduce((s, d) => s + d.seconds, 0);

  const companyRows = useMemo(() => {
    const rows = data?.byCompany || [];
    const total = rows.reduce((s, r) => s + r.seconds, 0) || 1;
    return rows.map((r, i) => ({
      ...r,
      pct: Math.round((r.seconds / total) * 100),
      color: COMPANY_COLORS[i % COMPANY_COLORS.length],
      host: `${r.name}.bitrix24.ru`,
    }));
  }, [data]);

  const matchPct = data?.kpi.match_pct ?? 0;
  const vsY = data?.kpi.vs_yesterday_pct;

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
          <DatePicker value={day} onChange={setDay} />
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

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-1 font-semibold tracking-tight">Активность по времени</div>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Минуты по категориям по полчаса
          </p>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--color-muted-foreground)]">
            {CATEGORY_ORDER.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: CATEGORY_COLORS[c] }}
                />
                {CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>
          <div className="h-64">
            {!hasStacked ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                Нет данных за выбранный период
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stackedData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="8%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    interval={1}
                    minTickGap={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    wrapperStyle={{ zIndex: 50 }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
                    }}
                    labelStyle={{ color: "var(--color-muted-foreground)" }}
                    itemStyle={{ color: "var(--color-foreground)" }}
                    formatter={(v: number, name: string) => [
                      `${v} мин`,
                      CATEGORY_LABELS[name as Category] || name,
                    ]}
                  />
                  {CATEGORY_ORDER.map((c, i) => (
                    <Bar
                      key={c}
                      dataKey={c}
                      stackId="a"
                      fill={CATEGORY_COLORS[c]}
                      radius={i === CATEGORY_ORDER.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={22}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <TrendingUp className="h-4 w-4 text-[var(--color-success)]" />
            Matched {matchPct}% · {formatDuration(data?.kpi.active_sec || 0)} активно
            {vsY != null ? ` · ${vsY >= 0 ? "+" : ""}${vsY}% к вчера` : ""}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-1 font-semibold tracking-tight">По категориям</div>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Распределение активного времени
          </p>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--color-muted-foreground)]">
            {CATEGORY_ORDER.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: CATEGORY_COLORS[c] }}
                />
                {CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>
          {donutData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              Пока нет данных
            </div>
          ) : (
            <div className="relative h-72 overflow-visible">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="seconds"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="88%"
                    paddingAngle={2}
                    stroke="var(--color-card)"
                  >
                    {donutData.map((d) => (
                      <Cell key={d.id} fill={CATEGORY_COLORS[d.id]} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 50 }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
                    }}
                    labelStyle={{ color: "var(--color-foreground)", fontWeight: 600 }}
                    itemStyle={{ color: "var(--color-foreground)" }}
                    formatter={(v: number, name: string) => [formatDuration(v), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-xl font-bold tracking-tight">{formatDuration(donutTotal)}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">всего</div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-1 font-semibold tracking-tight">По компаниям (Bitrix24)</div>
        <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
          Порталы <span className="font-mono">*.bitrix24.ru</span> по субдомену
        </p>
        {companyRows.length === 0 ? (
          <div className="flex h-28 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Пока нет визитов на порталы Bitrix24
          </div>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={companyRows}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  width={36}
                  tickFormatter={(v) => `${Math.round(Number(v) / 60)}м`}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 50 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                  formatter={(v: number) => [formatDuration(v), "время"]}
                />
                <Bar dataKey="seconds" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {companyRows.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <ActivityTimeline day={day} segments={data?.timeline || []} />
    </div>
  );
}
