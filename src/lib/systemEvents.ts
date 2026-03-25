import { supabase } from "@/lib/supabase";

export type SystemEventSeverity = "info" | "warning" | "error";

export type SystemEventRecord = {
  id: string;
  eventName: string;
  severity: SystemEventSeverity;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

const EVENTS_STORAGE_KEY = "gm_system_events_v1";
const MAX_LOCAL_EVENTS = 80;

let remoteUploadDisabled = false;

function safeParse(json: string | null): SystemEventRecord[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SystemEventRecord[]) : [];
  } catch {
    return [];
  }
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeValue);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sanitizeValue(entryValue)]));
  }
  return String(value);
}

function persistLocal(record: SystemEventRecord) {
  try {
    const current = safeParse(localStorage.getItem(EVENTS_STORAGE_KEY));
    const next = [record, ...current].slice(0, MAX_LOCAL_EVENTS);
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

async function uploadRemote(record: SystemEventRecord) {
  if (remoteUploadDisabled) return;

  const { error } = await supabase.from("app_events").insert({
    event_name: record.eventName,
    severity: record.severity,
    message: record.message,
    payload: record.payload ?? null,
    source: "totem",
    created_at: record.createdAt,
  });

  if (!error) return;

  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  if (
    code === "42P01" ||
    code === "42501" ||
    code === "PGRST204" ||
    message.includes("app_events") ||
    message.includes("permission denied")
  ) {
    remoteUploadDisabled = true;
  }
}

export function listStoredSystemEvents(): SystemEventRecord[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(EVENTS_STORAGE_KEY));
}

export function clearStoredSystemEvents() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(EVENTS_STORAGE_KEY);
  } catch {}
}

export function getLatestSystemEvent(eventName: string): SystemEventRecord | null {
  const events = listStoredSystemEvents();
  return events.find((event) => event.eventName === eventName) ?? null;
}

export async function recordSystemEvent(input: {
  eventName: string;
  severity?: SystemEventSeverity;
  message: string;
  payload?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;

  const record: SystemEventRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    eventName: input.eventName,
    severity: input.severity ?? "info",
    message: input.message,
    createdAt: new Date().toISOString(),
    payload: input.payload ? (sanitizeValue(input.payload) as Record<string, unknown>) : undefined,
  };

  persistLocal(record);
  void uploadRemote(record);
}
