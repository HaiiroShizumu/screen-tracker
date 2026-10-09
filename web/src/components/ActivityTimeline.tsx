import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "@/lib/utils";
import { Badge, Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type TimelineSeg = {
  id: number;
  ts_start: string;
  ts_end: string;
  duration_sec: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
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

function hashTone(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const shades = [0.9, 0.75, 0.6, 0.45, 0.35];
  return shades[Math.abs(h) % shades.length];
}

export function ActivityTimeline({ day, segments }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "brush" | null>(null);
  const brushOrigin = useRef<number | null>(null);

  const full = useMemo(() => {
    if (!segments.length) {
      return { start: 0, end: 24 * 60, span: 24 * 60 };
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

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold tracking-tight">Timeline</div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {day} · наведи на полоску · выдели диапазон мышкой или ползунками
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {filtered.length}/{segments.length} · {formatDuration(filteredSec)}
          </Badge>
        </div>
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

      {/* ticks */}
      <div className="relative mt-5 h-4 text-[10px] text-[var(--color-muted-foreground)]">
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

      {/* main track */}
      <div
        ref={trackRef}
        className="relative mt-1 h-20 cursor-crosshair select-none overflow-hidden rounded-xl bg-[var(--color-muted)]"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return;
          const m = minsFromClientX(e.clientX);
          brushOrigin.current = m;
          setDragging("brush");
          setFilter({ from: m, to: m + 1 });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* selection overlay outside filter */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--color-background)]/55"
          style={{ width: `${pct(filter.from)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-[var(--color-background)]/55"
          style={{ width: `${100 - pct(filter.to)}%` }}
        />

        {segments.map((seg) => {
          const a = toMin(seg.ts_start);
          const b = toMin(seg.ts_end);
          const left = pct(a);
          const width = Math.max(pct(b) - pct(a), 0.25);
          const inFilter = b >= filter.from && a <= filter.to;
          const label = seg.domain || seg.app;
          const opacity = hashTone(label);
          return (
            <div
              key={seg.id}
              className={cn(
                "absolute top-3 bottom-3 rounded-md transition-opacity",
                inFilter ? "bg-[var(--color-foreground)]" : "bg-[var(--color-foreground)]/25"
              )}
              style={{ left: `${left}%`, width: `${width}%`, opacity: inFilter ? opacity : 0.2 }}
              onMouseEnter={(e) => {
                const rect = trackRef.current?.getBoundingClientRect();
                if (!rect) return;
                setHover({
                  seg,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseMove={(e) => {
                const rect = trackRef.current?.getBoundingClientRect();
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

        {/* range handles */}
        <Handle
          left={pct(filter.from)}
          onDown={() => setDragging("start")}
          label={fmtClock(filter.from)}
        />
        <Handle
          left={pct(filter.to)}
          onDown={() => setDragging("end")}
          label={fmtClock(filter.to)}
        />

        {hover && (
          <div
            className="pointer-events-none absolute z-20 max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs shadow-lg"
            style={{
              left: Math.min(hover.x + 12, (trackRef.current?.clientWidth || 300) - 220),
              top: Math.max(4, hover.y - 70),
            }}
          >
            <div className="font-semibold">{hover.seg.domain || hover.seg.app}</div>
            {hover.seg.title && (
              <div className="mt-0.5 line-clamp-2 text-[var(--color-muted-foreground)]">
                {hover.seg.title}
              </div>
            )}
            {hover.seg.url && (
              <div className="mt-1 truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
                {hover.seg.url}
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

      {/* dual range slider */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-[var(--color-muted-foreground)]">
          От {fmtClock(filter.from)}
          <input
            type="range"
            min={full.start}
            max={full.end}
            step={1}
            value={filter.from}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                from: Math.min(Number(e.target.value), f.to - 5),
              }))
            }
            className="mt-1 w-full accent-[var(--color-foreground)]"
          />
        </label>
        <label className="text-xs text-[var(--color-muted-foreground)]">
          До {fmtClock(filter.to)}
          <input
            type="range"
            min={full.start}
            max={full.end}
            step={1}
            value={filter.to}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                to: Math.max(Number(e.target.value), f.from + 5),
              }))
            }
            className="mt-1 w-full accent-[var(--color-foreground)]"
          />
        </label>
      </div>

      <div className="mt-5 max-h-72 space-y-0 overflow-auto text-sm">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-muted-foreground)]">
            Нет сегментов в выбранном диапазоне
          </div>
        ) : (
          filtered.map((seg) => (
            <div
              key={seg.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-2.5 last:border-0"
              onMouseEnter={() =>
                setHover({ seg, x: 40, y: 20 })
              }
              onMouseLeave={() => setHover(null)}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {seg.domain || seg.app}
                  {seg.title ? ` — ${seg.title}` : ""}
                </div>
                <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                  {new Date(seg.ts_start).toLocaleTimeString()} –{" "}
                  {new Date(seg.ts_end).toLocaleTimeString()}
                  {seg.url ? ` · ${seg.url}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-[var(--color-muted-foreground)]">
                {formatDuration(seg.duration_sec)}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Handle({
  left,
  onDown,
  label,
}: {
  left: number;
  onDown: () => void;
  label: string;
}) {
  return (
    <div
      data-handle="1"
      className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize"
      style={{ left: `${left}%` }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onDown();
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[var(--color-foreground)]" />
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-[var(--color-foreground)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-background)]">
        {label}
      </div>
    </div>
  );
}
