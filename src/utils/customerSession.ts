export function getCustomerSessionSnapshot<T = any>(): T | unknown {
  try {
    const raw = localStorage.getItem("customer_session");
    if (!raw) return {};
    if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
      return JSON.parse(raw) as T;
    }
    return {};
  } catch {
    return {};
  }
}

export function getCustomerSessionSnapshotOrNull<T = any>(): T | null {
  try {
    const raw = localStorage.getItem("customer_session");
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
