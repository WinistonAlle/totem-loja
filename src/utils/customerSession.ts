import { APP_EVENT, emitAppEvent } from "@/lib/appEvents";

export type CustomerSessionLike = {
  id?: string | number;
  customer_id?: string | number;
  user_id?: string | number;
  name?: string | null;
  customer_name?: string | null;
  full_name?: string | null;
  document?: string | null;
  customer_document?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  doc?: string | null;
  email?: string | null;
  role?: string | null;
  tipo?: string | null;
  [key: string]: unknown;
};

const CUSTOMER_SESSION_KEY = "customer_session";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getCustomerSessionSnapshot<T extends CustomerSessionLike = CustomerSessionLike>(): T | Record<string, never> {
  const storage = getStorage();
  const parsed = safeParse<T>(storage?.getItem(CUSTOMER_SESSION_KEY) ?? null);
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function getCustomerSessionSnapshotOrNull<T extends CustomerSessionLike = CustomerSessionLike>(): T | null {
  const storage = getStorage();
  const parsed = safeParse<T>(storage?.getItem(CUSTOMER_SESSION_KEY) ?? null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function saveCustomerSession(session: CustomerSessionLike) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
  emitAppEvent(APP_EVENT.customerSessionChanged);
}

export function clearCustomerSession() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(CUSTOMER_SESSION_KEY);
  emitAppEvent(APP_EVENT.customerSessionChanged);
}

export function hasCustomerSession(session: CustomerSessionLike | null | undefined): boolean {
  if (!session) return false;

  return Boolean(
    session.id ||
      session.customer_id ||
      session.user_id ||
      session.document ||
      session.customer_document ||
      session.cpf ||
      session.cnpj ||
      session.email
  );
}
