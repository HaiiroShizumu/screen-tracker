import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type EditorKind = "Cursor" | "Code";

const STORAGE: Record<EditorKind, string> = {
  Cursor: path.join(
    os.homedir(),
    "Library/Application Support/Cursor/User/globalStorage/storage.json"
  ),
  Code: path.join(
    os.homedir(),
    "Library/Application Support/Code/User/globalStorage/storage.json"
  ),
};

const cache = new Map<EditorKind, { mtime: number; project: string | null; folderUri: string | null }>();

function projectFromUri(uri: string | null | undefined): { name: string; folderUri: string } | null {
  if (!uri) return null;
  try {
    // file:///Users/.../proj or vscode-remote://.../path
    let pathname = uri;
    if (uri.startsWith("file://")) {
      pathname = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    } else if (uri.includes("://")) {
      const without = uri.replace(/^[^:]+:\/\//, "");
      const slash = without.indexOf("/");
      pathname = slash >= 0 ? decodeURIComponent(without.slice(slash)) : without;
    }
    const name = path.basename(pathname.replace(/\/$/, "")) || pathname;
    if (!name || name === "." || name === "/") return null;
    return { name, folderUri: uri };
  } catch {
    return null;
  }
}

function readEditorProject(kind: EditorKind): { name: string; folderUri: string } | null {
  const file = STORAGE[kind];
  try {
    const st = fs.statSync(file);
    const hit = cache.get(kind);
    if (hit && hit.mtime === st.mtimeMs) {
      return hit.project ? { name: hit.project, folderUri: hit.folderUri || "" } : null;
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      windowsState?: {
        lastActiveWindow?: { folder?: string; workspace?: string };
        openedWindows?: Array<{ folder?: string; workspace?: string }>;
      };
    };
    const folder =
      raw.windowsState?.lastActiveWindow?.folder ||
      raw.windowsState?.lastActiveWindow?.workspace ||
      raw.windowsState?.openedWindows?.[0]?.folder ||
      null;
    const parsed = projectFromUri(folder);
    cache.set(kind, {
      mtime: st.mtimeMs,
      project: parsed?.name ?? null,
      folderUri: parsed?.folderUri ?? null,
    });
    return parsed;
  } catch {
    cache.set(kind, { mtime: 0, project: null, folderUri: null });
    return null;
  }
}

/** When Cursor/VS Code is frontmost — return project folder name + file URI. */
export function getIdeProject(
  app: string,
  bundleId: string | null
): { editor: EditorKind; name: string; folderUri: string } | null {
  const isCursor =
    app === "Cursor" || bundleId === "com.todesktop.230313mzl4w4u92";
  const isCode =
    app === "Code" ||
    app === "Visual Studio Code" ||
    bundleId === "com.microsoft.VSCode";

  if (isCursor) {
    const p = readEditorProject("Cursor");
    return p ? { editor: "Cursor", ...p } : null;
  }
  if (isCode) {
    const p = readEditorProject("Code");
    return p ? { editor: "Code", ...p } : null;
  }
  return null;
}
