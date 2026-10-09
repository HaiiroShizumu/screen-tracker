import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_COLORS, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { formatDuration } from "@/lib/utils";
import { Badge, Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/AppIcon";

export type TimelineSeg = {
  id: string | number;
  ts_start: string;
  ts_end: string;
  duration_sec: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  category: Category;
  row_key: string;
  segment_count?: number;
};

type Props = {
  day: string;
  segments: TimelineSeg[];
};

type HoverInfo = {
  seg: TimelineSeg;
  x: number;
  y: number;
};

function toMin(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function fmtClock(mins: number) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function ActivityTimeline({ day, segments }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "brush" | null>(null);
  const brushOrigin = useRef<number | null>(null);

  const full = useMemo(() => {
    if (!segments.length) {
      return { start: 9 * 60, end: 18 * 60, span: 9 * 60 };
    }
    const starts = segments.map((s) => toMin(s.ts_start));
    const ends = segments.map((s) => toMin(s.ts_end));
    const start = Math.max(0, Math.floor(Math.min(...starts) / 15) * 15 - 15);
    const end = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 15) * 15 + 15);
    return { start, end, span: Math.max(1, end - start) };
  }, [segments]);

  const [filter, setFilter] = useState({ from: 0, to: 24 * 60 });

  useEffect(() => {
    setFilter({ from: full.start, to: full.end });
  }, [full.start, full.end, day]);

  const filtered = useMemo(() => {
    return segments.filter((s) => {
      const a = toMin(s.ts_start);
      const b = toMin(s.ts_end);
      return b >= filter.from && a <= filter.to;
    });
  }, [segments, filter]);

  const rows = useMemo(() => {
    const map = new Map<string, TimelineSeg[]>();
    for (const s of filtered) {
      const key = s.row_key || s.domain || s.app;
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, segs]) => ({
        key,
        segs,
        total: segs.reduce((a, s) => a + s.duration_sec, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const filteredSec = useMemo(
    () => filtered.reduce((sum, s) => sum + s.duration_sec, 0),
    [filtered]
  );

  const pct = useCallback(
    (mins: number) => ((mins - full.start) / full.span) * 100,
    [full]
  );

  const minsFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return full.start;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return full.start + ratio * full.span;
    },
    [full]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const m = minsFromClientX(e.clientX);
      setFilter((f) => {
        if (dragging === "start") return { ...f, from: Math.min(m, f.to - 5) };
        if (dragging === "end") return { ...f, to: Math.max(m, f.from + 5) };
        if (dragging === "brush" && brushOrigin.current != null) {
          const a = brushOrigin.current;
          return { from: Math.min(a, m), to: Math.max(a, m) };
        }
        return f;
      });
    };
    const onUp = () => {
      setDragging(null);
      brushOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, minsFromClientX]);

  const ticks = useMemo(() => {
    const step = full.span > 8 * 60 ? 120 : full.span > 4 * 60 ? 60 : 30;
    const out: number[] = [];
    const first = Math.ceil(full.start / step) * step;
    for (let t = first; t <= full.end; t += step) out.push(t);
    return out;
  }, [full]);

  const presets = [
    { label: "Весь день", from: full.start, to: full.end },
    { label: "Утро", from: 6 * 60, to: 12 * 60 },
    { label: "День", from: 12 * 60, to: 18 * 60 },
    { label: "Вечер", from: 18 * 60, to: 23 * 60 },
  ];

  const fromPct = pct(filter.from);
  const toPct = pct(filter.to);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(11rem,14rem)_minmax(0,1fr)] md:items-stretch">
      <Card className="order-2 flex h-full max-h-[36rem] min-h-0 flex-col p-3 md:order-1">
        <div className="mb-0.5 text-sm font-semibold tracking-tight">Сессии</div>
        <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
          {formatDuration(filteredSec)}
        </p>
        <div className="min-h-0 flex-1 space-y-0 overflow-auto text-xs">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-[var(--color-muted-foreground)]">
              Нет сессий
            </div>
          ) : (
            filtered.map((seg) => (
              <div
                key={seg.id}
                className="flex items-center gap-1.5 border-b border-[var(--color-border)] py-1.5 last:border-0"
                title={`${seg.domain || seg.app}${seg.title ? ` — ${seg.title}` : ""} · ${formatDuration(seg.duration_sec)}`}
              >
                <AppIcon app={seg.app} domain={seg.domain} url={seg.url} />
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-sm"
                  style={{ background: CATEGORY_COLORS[seg.category] }}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {seg.domain || seg.app}
                </span>
                <span className="shrink-0 tabular-nums text-[10px] text-[var(--color-muted-foreground)]">
                  {formatDuration(seg.duration_sec)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="order-1 flex min-h-0 flex-col p-5 md:order-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-semibold tracking-tight">Timeline</div>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {day} · тяни вертикальные линии, чтобы сузить диапазон
            </p>
          </div>
          <Badge>
            {filtered.length}/{segments.length} · {formatDuration(filteredSec)}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="outline"
              onClick={() =>
                setFilter({
                  from: Math.max(full.start, p.from),
                  to: Math.min(full.end, p.to),
                })
              }
            >
              {p.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Input
              type="time"
              className="w-[7.5rem]"
              value={fmtClock(filter.from)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isNaN(h)) return;
                setFilter((f) => ({ ...f, from: Math.min(h * 60 + (m || 0), f.to - 5) }));
              }}
            />
            <span className="text-[var(--color-muted-foreground)]">—</span>
            <Input
              type="time"
              className="w-[7.5rem]"
              value={fmtClock(filter.to)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isNaN(h)) return;
                setFilter((f) => ({ ...f, to: Math.max(h * 60 + (m || 0), f.from + 5) }));
              }}
            />
          </div>
        </div>

        <div
          className="relative mt-5 select-none"
          onMouseLeave={() => setHover(null)}
        >
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              Нет сессий в выбранном диапазоне
            </div>
          ) : (
            <div
              className="relative"
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).dataset.handle) return;
                if (!(e.target as HTMLElement).closest("[data-gantt-track]")) return;
                const m = minsFromClientX(e.clientX);
                brushOrigin.current = m;
                setDragging("brush");
                setFilter({ from: m, to: m + 1 });
              }}
            >
              <div className="relative mb-1 ml-[7.5rem] mr-14 h-4 text-[10px] text-[var(--color-muted-foreground)]">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute -translate-x-1/2 font-mono"
                    style={{ left: `${pct(t)}%` }}
                  >
                    {fmtClock(t)}
                  </span>
                ))}
              </div>
              <div className="relative space-y-1.5">
                <div
                  ref={trackRef}
                  className="pointer-events-none absolute inset-y-0 left-[7.5rem] right-14 z-[3]"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--color-background)]/55"
                    style={{ width: `${fromPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 bg-[var(--color-background)]/55"
                    style={{ width: `${100 - toPct}%` }}
                  />
                  <RangeEdge
                    left={fromPct}
                    label={fmtClock(filter.from)}
                    onDown={() => setDragging("start")}
                    active={dragging === "start"}
                  />
                  <RangeEdge
                    left={toPct}
                    label={fmtClock(filter.to)}
                    onDown={() => setDragging("end")}
                    active={dragging === "end"}
                  />
                </div>

                {rows.map((row) => {
                  const sample = row.segs[0];
                  return (
                    <div key={row.key} className="relative z-[2] flex items-center gap-2">
                      <div
                        className="flex w-[7rem] shrink-0 items-center justify-end gap-1.5 truncate text-xs font-medium"
                        title={row.key}
                      >
                        <AppIcon app={sample?.app} domain={sample?.domain} url={sample?.url} />
                        <span className="truncate">{row.key}</span>
                      </div>
                      <div
                        data-gantt-track
                        className="relative h-8 flex-1 overflow-hidden rounded-md bg-[var(--color-muted)]"
                      >
                        {row.segs.map((seg) => {
                          const a = toMin(seg.ts_start);
                          const b = toMin(seg.ts_end);
                          const left = pct(a);
                          const width = Math.max(pct(b) - pct(a), 0.35);
                          return (
                            <div
                              key={seg.id}
                              className="absolute top-1 bottom-1 rounded-sm"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                background:
                                  CATEGORY_COLORS[seg.category] || CATEGORY_COLORS.other,
                              }}
                              onMouseEnter={(e) => {
                                const wrap = e.currentTarget.closest(".relative.mt-5");
                                const rect = wrap?.getBoundingClientRect();
                                if (!rect) return;
                                setHover({
                                  seg,
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top,
                                });
                              }}
                              onMouseMove={(e) => {
                                const wrap = e.currentTarget.closest(".relative.mt-5");
                                const rect = wrap?.getBoundingClientRect();
                                if (!rect) return;
                                setHover({
                                  seg,
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top,
                                });
                              }}
                              onMouseLeave={() => setHover(null)}
                            />
                          );
                        })}
                      </div>
                      <div className="w-14 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                        {formatDuration(row.total)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hover && (
            <div
              className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-popover)] p-3 text-xs shadow-lg"
              style={{
                left: Math.min(hover.x + 12, 280),
                top: Math.max(4, hover.y - 70),
              }}
            >
              <div className="flex items-center gap-2 font-semibold">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: CATEGORY_COLORS[hover.seg.category] }}
                />
                {hover.seg.domain || hover.seg.app}
              </div>
              <div className="mt-0.5 text-[var(--color-muted-foreground)]">
                {CATEGORY_LABELS[hover.seg.category]}
                {hover.seg.segment_count && hover.seg.segment_count > 1
                  ? ` · ${hover.seg.segment_count} сегм.`
                  : ""}
              </div>
              {hover.seg.title && (
                <div className="mt-0.5 line-clamp-2 text-[var(--color-muted-foreground)]">
                  {hover.seg.title}
                </div>
              )}
              <div className="mt-2 flex justify-between gap-3 font-mono text-[var(--color-muted-foreground)]">
                <span>
                  {new Date(hover.seg.ts_start).toLocaleTimeString()} –{" "}
                  {new Date(hover.seg.ts_end).toLocaleTimeString()}
                </span>
                <span>{formatDuration(hover.seg.duration_sec)}</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function RangeEdge({
  left,
  label,
  onDown,
  active,
}: {
  left: number;
  label: string;
  onDown: () => void;
  active: boolean;
}) {
  return (
    <div
      data-handle="1"
      title={label}
      className={cn(
        "pointer-events-auto absolute top-0 bottom-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize",
        active && "z-20"
      )}
      style={{ left: `${left}%` }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown();
      }}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition",
          active ? "bg-[var(--color-foreground)]" : "bg-[var(--color-foreground)]/70"
        )}
      />
      <div
        className={cn(
          "absolute top-1/2 left-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition",
          active
            ? "bg-[var(--color-foreground)]"
            : "bg-[var(--color-foreground)]/40 hover:bg-[var(--color-foreground)]/80"
        )}
      />
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-[var(--color-foreground)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-background)]">
        {label}
      </div>
    </div>
  );
}
