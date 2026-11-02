export type PreparedPage = {
  page: number;
  ready: number;
  pending: number | null;
  complete: boolean;
  updatedAt: number | null;
  at?: number;
  nextAt?: number;
  error?: string;
  end?: boolean;
};
export type Scope = {
  q: string;
  sort: string;
  pages: number;
  defaultScope: boolean;
  prepared: PreparedPage[];
};
export type AdminData = {
  token: string;
  server: {
    startedAt: string;
    uptime: number;
    pid: number;
    node: string;
    memoryBytes: number;
  };
  models: {
    cards: { configured: boolean; name: string };
    trials: { configured: boolean; name: string };
  };
  storage: {
    enabled: boolean;
    directory: string;
    files: number;
    bytes: number;
    cards: number;
    pages: number;
    trials: number;
    images?: number;
    imageBytes?: number;
    checkedAt: number;
  };
  library: {
    enabled: boolean;
    running: boolean;
    persistence: boolean;
    refreshMs: number;
    current: { q: string; sort: string; page: number; stage: string } | null;
    scopes: Scope[];
  };
};
export type Snapshot = { data: AdminData; fetchedAt: string };

export async function adminRequest<T>(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  token?: string,
): Promise<T> {
  let response;
  try {
    response = await fetch(`/api/admin/${path}`, {
      signal,
      ...(body
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Admin-Token": token || "",
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    if (signal.aborted) throw new Error("请求超时或已取消，请重新读取。");
    throw new Error(
      "无法连接网站服务。请在 PowerShell 执行 npm run lan:start，再重新读取。",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("后台没有返回有效数据，请重新读取。");
  }
  if (!response.ok) throw new Error(result.error || "操作失败，请稍后重试。");
  return result;
}
