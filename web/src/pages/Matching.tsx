import { useEffect, useMemo, useState } from "react";
import { FolderGit2, Globe, GripVertical, Laptop, Send, X } from "lucide-react";
import {
  api,
  deadlineBucket,
  formatDeadline,
  KANBAN_COLUMNS,
  type DeadlineBucket,
  type MatchGroup,
  type Task,
} from "@/lib/api";
import { cn, formatDuration, today } from "@/lib/utils";
import { Badge, Button, Card } from "@/components/ui";

const DRAG_TYPE = "application/x-st-group";

export function MatchingPage() {
  const day = today();
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOverTask, setDragOverTask] = useState<number | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);

  const load = async () => {
    setErr(null);
    const [m, t] = await Promise.all([api.matches(day), api.tasks()]);
    setGroups(m.groups);
    setTasks(t.tasks);
  };

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, []);

  const assigned = useMemo(
    () => groups.filter((g) => g.task_id && g.status !== "pushed"),
    [groups]
  );
  const pool = useMemo(() => groups.filter((g) => !g.task_id), [groups]);
  const onTask = useMemo(() => {
    const map = new Map<number, MatchGroup[]>();
    for (const g of groups) {
      if (!g.task_id) continue;
      const list = map.get(g.task_id) || [];
      list.push(g);
      map.set(g.task_id, list);
    }
    return map;
  }, [groups]);

  const readyCount = assigned.length;

  const columns = useMemo(() => {
    const by: Record<DeadlineBucket, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      this_week: [],
      next_week: [],
      later: [],
    };
    for (const t of tasks) {
      by[deadlineBucket(t.deadline)].push(t);
    }
    return KANBAN_COLUMNS.map((col) => ({
      key: col.key,
      label: col.label,
      tasks: by[col.key],
    }));
  }, [tasks]);

  const poolSections = useMemo(() => {
    const cursor: MatchGroup[] = [];
    const urls: MatchGroup[] = [];
    const apps: MatchGroup[] = [];
    for (const g of pool) {
      if (g.app?.startsWith("Cursor") || g.app?.startsWith("Code")) cursor.push(g);
      else if (g.domain) urls.push(g);
      else apps.push(g);
    }
    return [
      { key: "cursor", title: "Проекты Cursor", icon: FolderGit2, items: cursor },
      { key: "urls", title: "Похожие URL / сайты", icon: Globe, items: urls },
      { key: "apps", title: "Приложения", icon: Laptop, items: apps },
    ].filter((s) => s.items.length > 0);
  }, [pool]);

  const sync = async () => {
    setBusy(true);
    try {
      await api.syncBitrix();
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (group_key: string, task_id: number | null) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.assign(group_key, task_id);
      setGroups(r.groups);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
      setDragOverTask(null);
      setDragOverPool(false);
    }
  };

  const pushAll = async () => {
    setBusy(true);
    try {
      const r = await api.confirm(undefined, true, day);
      setGroups(r.groups);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (e: React.DragEvent, group_key: string) => {
    e.dataTransfer.setData(DRAG_TYPE, group_key);
    e.dataTransfer.setData("text/plain", group_key);
    e.dataTransfer.effectAllowed = "move";
  };

  const readKey = (e: React.DragEvent) =>
    e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Распределение</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void sync()}>
            Sync Bitrix
          </Button>
          <Button
            size="sm"
            disabled={busy || readyCount === 0}
            onClick={() => void pushAll()}
          >
            <Send className="h-3.5 w-3.5" />
            В Bitrix24
            {readyCount > 0 ? ` (${readyCount})` : ""}
          </Button>
        </div>
      </div>

      {err && (
        <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {err}
        </Card>
      )}

      {/* Kanban */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex w-[280px] shrink-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div
                  className={cn(
                    "text-sm font-semibold tracking-tight",
                    col.key === "overdue" && "text-red-600 dark:text-red-400"
                  )}
                >
                  {col.label}
                </div>
                <Badge tone={col.key === "overdue" ? "bad" : "neutral"}>{col.tasks.length}</Badge>
              </div>
              <div className="flex max-h-[min(52vh,560px)] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {col.tasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                    Нет задач
                  </div>
                )}
                {col.tasks.map((t) => {
                  const chips = onTask.get(t.task_id) || [];
                  const sec = chips.reduce((s, g) => s + g.duration_sec, 0);
                  const webs = safeJson(t.web_urls);
                  const over = dragOverTask === t.task_id;
                  return (
                    <div
                      key={t.task_id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverTask(t.task_id);
                      }}
                      onDragLeave={() => setDragOverTask((v) => (v === t.task_id ? null : v))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const key = readKey(e);
                        if (key) void onAssign(key, t.task_id);
                      }}
                      className={cn(
                        "rounded-lg border bg-[var(--color-card)] p-3 shadow-sm transition",
                        over
                          ? "border-[var(--color-foreground)] ring-2 ring-[var(--color-ring)]/40"
                          : "border-[var(--color-border)]"
                      )}
                    >
                      <div className="text-sm font-medium leading-snug">
                        <span className="mr-1 text-[var(--color-muted-foreground)]">
                          #{t.task_id}
                        </span>
                        {t.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {formatDeadline(t.deadline) ? (
                          <span className={cn(col.key === "overdue" && "text-red-600 dark:text-red-400")}>
                            до {formatDeadline(t.deadline)}
                          </span>
                        ) : (
                          <span>без срока</span>
                        )}
                        {webs.length > 0 && <span className="truncate">{webs[0]}</span>}
                      </div>
                      {sec > 0 && (
                        <div className="mt-2 text-xs font-medium tabular-nums">
                          {formatDuration(sec)} на задаче
                        </div>
                      )}
                      {chips.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {chips.map((g) => (
                            <TimeChip
                              key={g.group_key}
                              group={g}
                              busy={busy}
                              onDragStart={onDragStart}
                              onRemove={() => void onAssign(g.group_key, null)}
                            />
                          ))}
                        </div>
                      )}
                      {chips.length === 0 && (
                        <div className="mt-2 rounded-md border border-dashed border-[var(--color-border)] px-2 py-2 text-[11px] text-[var(--color-muted-foreground)]">
                          Перетащи сюда время
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time pool */}
      <Card
        className={cn(
          "overflow-hidden transition",
          dragOverPool && "ring-2 ring-[var(--color-ring)]/40"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverPool(true);
        }}
        onDragLeave={() => setDragOverPool(false)}
        onDrop={(e) => {
          e.preventDefault();
          const key = readKey(e);
          if (key) void onAssign(key, null);
        }}
      >
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <div className="font-semibold tracking-tight">Моё время</div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Сгруппировано по похожим URL и проектам Cursor. Перетащи на задачу выше или верни
            сюда с карточки.
          </p>
        </div>

        {pool.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-muted-foreground)]">
            {groups.length === 0
              ? "Нет активности за этот день."
              : "Всё время разложено по задачам."}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {poolSections.map((sec) => (
              <div key={sec.key}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-muted-foreground)]">
                  <sec.icon className="h-4 w-4" />
                  {sec.title}
                  <span className="tabular-nums">
                    ({formatDuration(sec.items.reduce((s, g) => s + g.duration_sec, 0))})
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sec.items.map((g) => (
                    <TimeChip
                      key={g.group_key}
                      group={g}
                      busy={busy}
                      large
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TimeChip({
  group,
  busy,
  large,
  onDragStart,
  onRemove,
}: {
  group: MatchGroup;
  busy: boolean;
  large?: boolean;
  onDragStart: (e: React.DragEvent, key: string) => void;
  onRemove?: () => void;
}) {
  const label = group.domain || group.app || "unknown";
  const sub = group.titles[0] || group.urls[0] || null;
  const tone =
    group.status === "pushed"
      ? "good"
      : group.confidence === "high"
        ? "good"
        : group.confidence === "suggested" || group.confidence === "manual"
          ? "warn"
          : "neutral";

  return (
    <div
      draggable={!busy && group.status !== "pushed"}
      onDragStart={(e) => onDragStart(e, group.group_key)}
      className={cn(
        "group flex items-start gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-left transition",
        group.status !== "pushed" && "cursor-grab active:cursor-grabbing",
        large ? "max-w-full px-3 py-2" : "w-full px-2 py-1.5"
      )}
    >
      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] opacity-60" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-medium", large ? "text-sm" : "text-xs")}>{label}</span>
          <span className="text-xs font-medium tabular-nums text-[var(--color-muted-foreground)]">
            {formatDuration(group.duration_sec)}
          </span>
          {group.confidence !== "none" && (
            <Badge tone={tone}>{group.status === "pushed" ? "в Bitrix" : group.confidence}</Badge>
          )}
        </div>
        {large && sub && (
          <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{sub}</div>
        )}
      </div>
      {onRemove && group.status !== "pushed" && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="Снять с задачи"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function safeJson(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
