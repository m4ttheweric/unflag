export function readOverrides(storageKey: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function writeOverrides(storageKey: string, overrides: Record<string, unknown>): void {
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(overrides));
    }
  } catch {
    // storage unavailable (private mode, SSR misuse): overrides stay in-memory
  }
}
