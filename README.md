# Screen Tracker

Локальный трекер активности macOS → SQLite → дашборд (Vite/React/shadcn-стиль) → Bitrix24 → дневной MD-отчёт (MiMo).

## Стек

- `server/` — Express + SQLite + коллектор (Reflect-style) + Bitrix + cron 17:40
- `web/` — Vite + React + Tailwind
- `electron/` — оболочка `.app`

## Запуск

```bash
cp .env.example .env   # уже есть .env — проверь ключи
npm install
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:3847/api/health  

macOS `.app`:

```bash
npm run build:mac
```

В Electron (dev): `npm run start -w electron` (сначала должен быть собран/запущен server).

## Права macOS

System Settings → Privacy & Security → **Automation**: Terminal/Node/Electron → System Events, Google Chrome / Safari / Arc.

## Bitrix

`SMB_WEBHOOK_URL` — входящий вебхук пользователя (желательно Андрей Родькин). Нужны права `task`, `crm`, `user`.

Опционально зафиксируй ID:

```
BITRIX_USER_ID=7036
BITRIX_USER_NAME=Андрей Родькин
```

## Отчёт

По будням в **17:40** пишется `reports/YYYY-MM-DD.md` + секция ИИ-саммари через MiMo. Кнопка «Отчёт сейчас» в сайдбаре.
