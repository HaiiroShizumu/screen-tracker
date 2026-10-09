import { db, getMeta, setMeta } from "./db.js";
import { baseDomain, domainFromUrl, fetchTimeout } from "./util.js";

const webhook = () => {
  const u = process.env.SMB_WEBHOOK_URL?.replace(/\/?$/, "/");
  if (!u) throw new Error("SMB_WEBHOOK_URL missing");
  return u;
};

async function bx<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetchTimeout(
    `${webhook()}${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
    25_000
  );
  const json = (await res.json()) as { result?: T; error?: string; error_description?: string };
  if (json.error) {
    throw new Error(`${method}: ${json.error} ${json.error_description || ""}`);
  }
  return json.result as T;
}

export async function resolveUserId(): Promise<number> {
  const cached = process.env.BITRIX_USER_ID || getMeta("bitrix_user_id");
  if (cached) return Number(cached);

  const name = process.env.BITRIX_USER_NAME || "Андрей Родькин";
  const parts = name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  const users = await bx<
    Array<{ ID: string; NAME: string; LAST_NAME: string }>
  >("user.get", { FILTER: { LAST_NAME: lastName } });

  const hit =
    users.find(
      (u) =>
        `${u.NAME} ${u.LAST_NAME}`.trim() === name ||
        `${u.LAST_NAME} ${u.NAME}`.trim() === name
    ) || users[0];

  if (!hit) throw new Error(`Bitrix user not found: ${name}`);
  setMeta("bitrix_user_id", hit.ID);
  return Number(hit.ID);
}

function parseCrmLinks(uf: unknown): { deals: number[]; companies: number[] } {
  const arr = Array.isArray(uf) ? uf : [];
  const deals: number[] = [];
  const companies: number[] = [];
  for (const item of arr) {
    const s = String(item);
    if (s.startsWith("D_")) deals.push(Number(s.slice(2)));
    if (s.startsWith("CO_")) companies.push(Number(s.slice(3)));
  }
  return { deals, companies };
}

function webValues(web: unknown): string[] {
  const out: string[] = [];
  if (!web) return out;
  const list = Array.isArray(web) ? web : [web];
  for (const item of list) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object" && "VALUE" in item) {
      out.push(String((item as { VALUE: string }).VALUE));
    }
  }
  return out;
}

async function companyWebs(companyId: number): Promise<string[]> {
  const company = await bx<Record<string, unknown>>("crm.company.get", { id: companyId });
  const urls = webValues(company.WEB);
  const domains = new Set<string>();
  for (const u of urls) {
    const d = domainFromUrl(u);
    if (d) {
      domains.add(d);
      const b = baseDomain(d);
      if (b) domains.add(b);
    }
  }
  return [...domains];
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

export async function syncBitrixTasks(): Promise<{ count: number; userId: number }> {
  const userId = await resolveUserId();
  type TaskT = {
    id: string;
    title: string;
    responsibleId?: string;
    status?: string;
    deadline?: string | null;
    ufCrmTask?: unknown;
  };
  const raw: TaskT[] = [];

  let start = 0;
  for (;;) {
    const res = await fetchTimeout(
      `${webhook()}tasks.task.list`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          // open + исполнитель или соисполнитель
          filter: { MEMBER: userId, "!STATUS": 5 },
          select: ["ID", "TITLE", "RESPONSIBLE_ID", "STATUS", "DEADLINE", "UF_CRM_TASK"],
          start,
        }),
      },
      30_000
    );
    const json = (await res.json()) as {
      result?: { tasks?: TaskT[] };
      next?: number;
      error?: string;
      error_description?: string;
    };
    if (json.error) throw new Error(`tasks.task.list: ${json.error} ${json.error_description || ""}`);
    const batch = json.result?.tasks || [];
    raw.push(...batch);
    if (json.next == null || batch.length === 0) break;
    start = json.next;
    if (raw.length > 500) break; // ponytail: hard cap
  }

  // skip «Диалоги» chatter tasks
  const tasks = raw.filter((t) => !/диалог/i.test(t.title || ""));

  const companyCache = new Map<number, string[]>();
  const dealCompany = new Map<number, number | null>();

  const allDeals = new Set<number>();
  const parsed = tasks.map((t) => {
    const links = parseCrmLinks(t.ufCrmTask);
    for (const d of links.deals) allDeals.add(d);
    return { t, links };
  });

  await mapPool([...allDeals], 4, async (dealId) => {
    try {
      const deal = await bx<Record<string, unknown>>("crm.deal.get", { id: dealId });
      const cid = Number(deal.COMPANY_ID || 0) || null;
      dealCompany.set(dealId, cid);
    } catch (e) {
      console.warn("[bitrix] deal", dealId, e);
      dealCompany.set(dealId, null);
    }
  });

  const allCompanies = new Set<number>();
  for (const { links } of parsed) {
    for (const c of links.companies) allCompanies.add(c);
    for (const d of links.deals) {
      const c = dealCompany.get(d);
      if (c) allCompanies.add(c);
    }
  }

  await mapPool([...allCompanies], 4, async (cid) => {
    try {
      companyCache.set(cid, await companyWebs(cid));
    } catch (e) {
      console.warn("[bitrix] company", cid, e);
      companyCache.set(cid, []);
    }
  });

  const upsert = db.prepare(
    `INSERT INTO bitrix_tasks (task_id, title, responsible_id, status, deadline, deal_ids, company_ids, web_urls, synced_at)
     VALUES (@task_id, @title, @responsible_id, @status, @deadline, @deal_ids, @company_ids, @web_urls, @synced_at)
     ON CONFLICT(task_id) DO UPDATE SET
       title=excluded.title,
       responsible_id=excluded.responsible_id,
       status=excluded.status,
       deadline=excluded.deadline,
       deal_ids=excluded.deal_ids,
       company_ids=excluded.company_ids,
       web_urls=excluded.web_urls,
       synced_at=excluded.synced_at`
  );

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const { t, links } of parsed) {
      const companyIds = new Set(links.companies);
      for (const d of links.deals) {
        const c = dealCompany.get(d);
        if (c) companyIds.add(c);
      }
      const webs = new Set<string>();
      for (const cid of companyIds) {
        for (const w of companyCache.get(cid) || []) webs.add(w);
      }
      upsert.run({
        task_id: Number(t.id),
        title: t.title,
        responsible_id: Number(t.responsibleId || userId),
        status: Number(t.status || 2),
        deadline: t.deadline || null,
        deal_ids: JSON.stringify(links.deals),
        company_ids: JSON.stringify([...companyIds]),
        web_urls: JSON.stringify([...webs]),
        synced_at: now,
      });
    }
    // drop completed / filtered-out / no longer assigned
    const keep = new Set(tasks.map((t) => Number(t.id)));
    const stale = db.prepare("SELECT task_id FROM bitrix_tasks").all() as Array<{ task_id: number }>;
    const del = db.prepare("DELETE FROM bitrix_tasks WHERE task_id = ?");
    for (const row of stale) {
      if (!keep.has(row.task_id)) del.run(row.task_id);
    }
  });
  tx();

  setMeta("bitrix_synced_at", now);
  return { count: tasks.length, userId };
}

export async function addElapsed(
  taskId: number,
  seconds: number,
  comment: string
): Promise<number> {
  const userId = await resolveUserId();
  const id = await bx<number>("task.elapseditem.add", {
    TASKID: taskId,
    ARFIELDS: {
      SECONDS: Math.max(60, Math.round(seconds)),
      COMMENT_TEXT: comment.slice(0, 500),
      USER_ID: userId,
    },
  });
  return id;
}

export function listCachedTasks() {
  return db
    .prepare(
      `SELECT * FROM bitrix_tasks
       ORDER BY CASE WHEN deadline IS NULL OR deadline = '' THEN 1 ELSE 0 END,
                deadline ASC,
                title COLLATE NOCASE`
    )
    .all() as Array<{
    task_id: number;
    title: string;
    responsible_id: number | null;
    status: number;
    deadline: string | null;
    deal_ids: string;
    company_ids: string;
    web_urls: string;
    synced_at: string;
  }>;
}
