import { useEffect, useState } from "react";
import { api, type MatchGroup, type Task } from "@/lib/api";
import { formatDuration, today } from "@/lib/utils";
import { Badge, Button, Card, Select } from "@/components/ui";

export function MatchingPage() {
  const [day, setDay] = useState(today());
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    const [m, t] = await Promise.all([api.matches(day), api.tasks()]);
    setGroups(m.groups);
    setTasks(t.tasks);
  };

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, [day]);

  const sync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.syncBitrix();
      await load();
      setMsg(`Синхронизировано задач: ${r.count}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (group_key: string, task_id: string) => {
    setBusy(true);
    try {
      const r = await api.assign(group_key, task_id ? Number(task_id) : null);
      setGroups(r.groups);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pushAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.confirm(undefined, true, day);
      setGroups(r.groups);
      setMsg(`Отправлено в Bitrix: ${r.pushed.length}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pushOne = async (group_key: string) => {
    setBusy(true);
    try {
      const r = await api.confirm([group_key], true, day);
      setGroups(r.groups);
      setMsg(`Отправлено: ${r.pushed.length}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const tone = (c: string) =>
    c === "high" ? "good" : c === "suggested" || c === "manual" ? "warn" : "bad";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Матчинг</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Домен → задача Bitrix. Одинаковый сайт за день — одна строка.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
          <Button variant="outline" disabled={busy} onClick={() => void sync()}>
            Sync Bitrix
          </Button>
          <Button variant="accent" disabled={busy} onClick={() => void pushAll()}>
            Раскидать всё
          </Button>
        </div>
      </div>

      {msg && <Card className="border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{msg}</Card>}
      {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</Card>}

      <div className="space-y-3">
        {groups.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Нет групп за этот день. Запусти коллектор и поработай в браузере.
          </Card>
        )}
        {groups.map((g) => (
          <Card key={g.group_key} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{g.domain || g.app || "unknown"}</span>
                  <Badge tone={tone(g.confidence)}>{g.confidence}</Badge>
                  <Badge tone={g.status === "pushed" ? "good" : "neutral"}>{g.status}</Badge>
                  <span className="text-sm text-[var(--color-muted-foreground)]">
                    {formatDuration(g.duration_sec)}
                  </span>
                </div>
                <div className="mt-1 truncate text-sm text-[var(--color-muted-foreground)]">
                  {g.titles.slice(0, 3).join(" · ") || "без заголовков"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-[220px]"
                  disabled={busy || g.status === "pushed"}
                  value={g.task_id ?? ""}
                  onChange={(e) => void onAssign(g.group_key, e.target.value)}
                >
                  <option value="">— без задачи —</option>
                  {tasks.map((t) => (
                    <option key={t.task_id} value={t.task_id}>
                      #{t.task_id} {t.title}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={busy || !g.task_id || g.status === "pushed"}
                  onClick={() => void pushOne(g.group_key)}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
