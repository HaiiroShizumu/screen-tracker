import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api, type AppSettings, type PermissionStatus } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

export function SettingsPage() {
  const [perms, setPerms] = useState<PermissionStatus | null>(null);
  const [form, setForm] = useState({ base_url: "", api_key: "", model: "" });
  const [keySet, setKeySet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    const [p, s] = await Promise.all([api.permissions(), api.settings()]);
    setPerms(p);
    setForm({
      base_url: s.ai.base_url,
      api_key: "",
      model: s.ai.model,
    });
    setKeySet(s.ai.has_key);
  };

  useEffect(() => {
    void load().catch((e) => setErr(String(e)));
  }, []);

  const openAutomation = () => {
    window.open(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
      "_blank"
    );
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const body: Partial<AppSettings["ai"]> & { api_key?: string } = {
        base_url: form.base_url.trim(),
        model: form.model.trim(),
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      const s = await api.saveSettings({ ai: body });
      setForm((f) => ({ ...f, api_key: "", base_url: s.ai.base_url, model: s.ai.model }));
      setKeySet(s.ai.has_key);
      setMsg("Сохранено");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Права macOS и параметры нейронки для отчётов.
        </p>
      </div>

      {err && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {err}
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Права macOS (Автоматизация)</div>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Без доступа не пишутся URL сайтов. Включи галочки для Screen Tracker / Electron →
              Chrome, Safari, Arc, System Events.
            </p>
            {perms && (
              <p className="mt-2 text-sm">
                {perms.ok ? (
                  <span className="text-[var(--color-foreground)]">Все нужные права выданы.</span>
                ) : (
                  <>
                    Не хватает:{" "}
                    <span className="font-medium">{perms.missing.join(", ") || "—"}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={openAutomation}>
            Открыть настройки macOS
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Проверить снова
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <div className="font-semibold">Нейронка (отчёты)</div>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            OpenAI-совместимый endpoint: URL, токен и модель.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[var(--color-muted-foreground)]">Base URL</span>
          <Input
            value={form.base_url}
            onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
            placeholder="https://…/v1"
            autoComplete="off"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[var(--color-muted-foreground)]">
            API-токен{keySet ? " (сохранён — оставь пустым, чтобы не менять)" : ""}
          </span>
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            placeholder={keySet ? "••••••••" : "tp-…"}
            autoComplete="off"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-[var(--color-muted-foreground)]">Модель</span>
          <Input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="mimo-v2.6-flash"
            autoComplete="off"
          />
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={busy}>
            Сохранить
          </Button>
          {msg && <span className="text-sm text-[var(--color-muted-foreground)]">{msg}</span>}
        </div>
      </Card>
    </div>
  );
}
