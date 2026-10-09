import { useEffect, useMemo, useState } from "react";
import { Ban, FolderGit2, Globe, GripVertical, Laptop, Send, Split, X } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
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
import { Badge, Button, Card, Input, Select } from "@/components/ui";

const DRAG_TYPE = "application/x-st-group";

export function MatchingPage() {
  const day = today();
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOverTask, setDragOverTask] = useState<number | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const [dragOverIgnored, setDragOverIgnored] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [roundTo, setRoundTo] = useState<number>(0);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [splitKey, setSplitKey] = useState<string | null>(null);
  const [splitSec, setSplitSec] = useState(300);

  const load = async () => {
    setErr(null);
    const [m, t] = await Promise.all([api.matches(day), api.tasks()]);
    setGroups(m.groups);
    setTasks(t.tasks);
  };

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, []);

  const ignored = useMemo(() => groups.filter((g) => g.status === "ignored"), [groups]);
  const assigned = useMemo(
    () => groups.filter((g) => g.task_id && g.status !== "pushed" && g.status !== "ignored"),
    [groups]
  );
  const pool = useMemo(
    () => groups.filter((g) => !g.task_id && g.status !== "ignored"),
    [groups]
  );
  const onTask = useMemo(() => {
    const map = new Map<number, MatchGroup[]>();
    for (const g of groups) {
      if (!g.task_id || g.status === "ignored") continue;
      const list = map.get(g.task_id) || [];
      list.push(g);
      map.set(g.task_id, list);
    }
    return map;
  }, [groups]);

  const totalSec = useMemo(
    () => groups.filter((g) => g.status !== "ignored").reduce((s, g) => s + g.duration_sec, 0),
    [groups]
  );
  const allocatedSec = useMemo(
    () =>
      groups
        .filter((g) => g.task_id && g.status !== "ignored")
        .reduce((s, g) => s + g.duration_sec, 0),
    [groups]
  );
  const allocatedPct = totalSec > 0 ? Math.round((allocatedSec / totalSec) * 100) : 0;

  const readyCount = assigned.length;

  const columns = useMemo(() => {
    const by: Record<DeadlineBucket, Task[]> = {
      overdue: [],
      today: [],
      this_week: [],
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
      setDragOverIgnored(false);
    }
  };

  const onIgnore = async (group_key: string) => {
    setBusy(true);
    try {
      const r = await api.ignore(group_key);
      setGroups(r.groups);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
      setDragOverIgnored(false);
    }
  };

  const openPreview = () => {
    const init: Record<string, string> = {};
    for (const g of assigned) {
      init[g.group_key] =
        comments[g.group_key] ||
        `${g.domain || g.app || "activity"} — ${g.titles[0] || ""}`.trim();
    }
    setComments(init);
    setPreviewOpen(true);
  };

  const pushAll = async () => {
    setBusy(true);
    try {
      const r = await api.confirm(
        assigned.map((g) => g.group_key),
        true,
        day,
        { round_to: roundTo || undefined, comments }
      );
      setGroups(r.groups);
      setPreviewOpen(false);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doSplit = async () => {
    if (!splitKey) return;
    setBusy(true);
    try {
      const r = await api.split(splitKey, splitSec);
      setGroups(r.groups);
      setSplitKey(null);
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
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Распределение</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Распределено {formatDuration(allocatedSec)} из {formatDuration(totalSec)} · {allocatedPct}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void sync()}>
            Sync Bitrix
          </Button>
          <Button size="sm" disabled={busy || readyCount === 0} onClick={openPreview}>
            <Send className="h-3.5 w-3.5" />
            В Bitrix24
            {readyCount > 0 ? ` (${readyCount})` : ""}
          </Button>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div
          className="h-full rounded-full bg-[var(--color-foreground)] transition-all"
          style={{ width: `${Math.min(100, allocatedPct)}%` }}
        />
      </div>

      {err && (
        <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {err}
        </Card>
      )}

      {/* Kanban */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => {
            const collapsed = col.key === "overdue" && !overdueOpen;
            return (
              <div
                key={col.key}
                className={cn(
                  "flex shrink-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40",
                  collapsed ? "w-[140px]" : "w-[280px]"
                )}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    className={cn(
                      "text-left text-sm font-semibold tracking-tight",
                      col.key === "overdue" && "text-red-600 dark:text-red-400"
                    )}
                    onClick={() => {
                      if (col.key === "overdue") setOverdueOpen((v) => !v);
                    }}
                  >
                    {col.label}
                    {col.key === "overdue" && !overdueOpen ? " ▸" : ""}
                  </button>
                  <Badge tone={col.key === "overdue" ? "bad" : "neutral"}>{col.tasks.length}</Badge>
                </div>
                {collapsed ? (
                  <button
                    type="button"
                    className="px-3 pb-3 text-xs text-[var(--color-muted-foreground)] hover:underline"
                    onClick={() => setOverdueOpen(true)}
                  >
                    Показать {col.tasks.length}
                  </button>
                ) : (
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
                              <span
                                className={cn(
                                  col.key === "overdue" && "text-red-600 dark:text-red-400"
                                )}
                              >
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
                                  onSplit={() => {
                                    setSplitKey(g.group_key);
                                    setSplitSec(Math.max(60, Math.floor(g.duration_sec / 2)));
                                  }}
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
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Time pool */}
        <Card
          className={cn(
            "overflow-hidden transition lg:col-span-2",
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
              Перетащи на задачу или в «Без задачи». После ручной привязки правило запоминается.
            </p>
          </div>

          {pool.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-muted-foreground)]">
              {groups.filter((g) => g.status !== "ignored").length === 0
                ? "Нет активности за этот день."
                : "Всё время разложено."}
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
                        onIgnore={() => void onIgnore(g.group_key)}
                        onSplit={() => {
                          setSplitKey(g.group_key);
                          setSplitSec(Math.max(60, Math.floor(g.duration_sec / 2)));
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Ignored column */}
        <Card
          className={cn(
            "overflow-hidden transition",
            dragOverIgnored && "ring-2 ring-[var(--color-ring)]/40"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverIgnored(true);
          }}
          onDragLeave={() => setDragOverIgnored(false)}
          onDrop={(e) => {
            e.preventDefault();
            const key = readKey(e);
            if (key) void onIgnore(key);
          }}
        >
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <Ban className="h-4 w-4" />
              Без задачи
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Личное / не списывать. Не влияет на Matched %.
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4">
            {ignored.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                Перетащи сюда, что не нужно в Б24
              </div>
            ) : (
              ignored.map((g) => (
                <TimeChip
                  key={g.group_key}
                  group={g}
                  busy={busy}
                  large
                  onDragStart={onDragStart}
                  onRemove={() => void onAssign(g.group_key, null)}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Split modal */}
      {splitKey && (
        <Modal title="Разделить время" onClose={() => setSplitKey(null)}>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Сколько секунд отщипнуть в новый блок (остаток останется на месте).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={60}
              max={Math.max(
                120,
                (groups.find((g) => g.group_key === splitKey)?.duration_sec || 120) - 1
              )}
              step={30}
              value={splitSec}
              onChange={(e) => setSplitSec(Number(e.target.value))}
              className="w-full accent-[var(--color-foreground)]"
            />
            <Input
              type="number"
              className="w-24"
              value={splitSec}
              onChange={(e) => setSplitSec(Number(e.target.value))}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums">{formatDuration(splitSec)} → новый блок</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSplitKey(null)}>
              Отмена
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void doSplit()}>
              Разделить
            </Button>
          </div>
        </Modal>
      )}

      {/* Bitrix preview modal */}
      {previewOpen && (
        <Modal title="Превью отправки в Bitrix24" onClose={() => setPreviewOpen(false)}>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted-foreground)]">Округление:</span>
            <Select
              value={String(roundTo)}
              onChange={(e) => setRoundTo(Number(e.target.value))}
              className="w-40"
            >
              <option value="0">без округления</option>
              <option value="5">до 5 мин</option>
              <option value="15">до 15 мин</option>
            </Select>
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-auto">
            {assigned.map((g) => {
              const rounded =
                roundTo > 0
                  ? Math.max(roundTo * 60, Math.round(g.duration_sec / (roundTo * 60)) * roundTo * 60)
                  : g.duration_sec;
              return (
                <div
                  key={g.group_key}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div className="text-sm font-medium">
                    #{g.task_id} {g.task_title}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {g.domain || g.app} · {formatDuration(g.duration_sec)}
                    {roundTo > 0 ? ` → ${formatDuration(rounded)}` : ""}
                  </div>
                  <Input
                    className="mt-2 w-full"
                    value={comments[g.group_key] || ""}
                    onChange={(e) =>
                      setComments((c) => ({ ...c, [g.group_key]: e.target.value }))
                    }
                    placeholder="Комментарий"
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void pushAll()}>
              <Send className="h-3.5 w-3.5" />
              Отправить
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="font-semibold tracking-tight">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TimeChip({
  group,
  busy,
  large,
  onDragStart,
  onRemove,
  onIgnore,
  onSplit,
}: {
  group: MatchGroup;
  busy: boolean;
  large?: boolean;
  onDragStart: (e: React.DragEvent, key: string) => void;
  onRemove?: () => void;
  onIgnore?: () => void;
  onSplit?: () => void;
}) {
  const label = group.domain || group.app || "unknown";
  const sub = group.titles[0] || group.urls[0] || null;
  const tone =
    group.status === "pushed"
      ? "good"
      : group.status === "ignored"
        ? "neutral"
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
          <AppIcon app={group.app} domain={group.domain} url={group.urls?.[0]} />
          <span className={cn("font-medium", large ? "text-sm" : "text-xs")}>{label}</span>
          <span className="text-xs font-medium tabular-nums text-[var(--color-muted-foreground)]">
            {formatDuration(group.duration_sec)}
          </span>
          {group.status === "ignored" ? (
            <Badge tone="neutral">без задачи</Badge>
          ) : group.confidence !== "none" ? (
            <Badge tone={tone}>{group.status === "pushed" ? "в Bitrix" : group.confidence}</Badge>
          ) : null}
        </div>
        {large && sub && (
          <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{sub}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {onSplit && group.status !== "pushed" && group.duration_sec > 60 && (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onSplit();
            }}
            className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            title="Разделить"
          >
            <Split className="h-3.5 w-3.5" />
          </button>
        )}
        {onIgnore && group.status !== "pushed" && (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onIgnore();
            }}
            className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            title="Без задачи"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
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
