// Fetch JSON from the app API and surface its error message
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function errorText(e: unknown) {
  if (e instanceof Error) {
    const m = e.message;
    const custom = m.match(/reverted with the following reason:\s*\n?(.*)|Error: (\w+)\(/);
    if (/User rejected|denied/i.test(m)) return "You cancelled the request in your wallet.";
    return custom ? (custom[1] || custom[2]).trim() : m.split("\n")[0];
  }
  return String(e);
}
