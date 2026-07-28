export const TELEMETRY_STORAGE_KEY = 'zys-telemetry-v1';
const TELEMETRY_LIMIT = 300;
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface TelemetryEntry {
  at: number;
  sessionId: string;
  event: string;
  fields: Record<string, string | number | boolean>;
}

function sanitizeFields(
  fields: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') safe[key.slice(0, 48)] = value.slice(0, 96);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key.slice(0, 48)] = value;
    else if (typeof value === 'boolean') safe[key.slice(0, 48)] = value;
  }
  return safe;
}

export function readTelemetry(): TelemetryEntry[] {
  try {
    const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is TelemetryEntry => (
      typeof entry === 'object'
      && entry !== null
      && typeof entry.at === 'number'
      && typeof entry.sessionId === 'string'
      && typeof entry.event === 'string'
      && typeof entry.fields === 'object'
      && entry.fields !== null
    )).slice(-TELEMETRY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Durable, device-local product telemetry. It never records story text,
 * player free input, API credentials, contact data or payment identifiers.
 */
export function recordTelemetry(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  try {
    const next = [...readTelemetry(), {
      at: Date.now(),
      sessionId: SESSION_ID,
      event: event.slice(0, 64),
      fields: sanitizeFields(fields),
    }].slice(-TELEMETRY_LIMIT);
    window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage and analytics are optional; gameplay must remain unaffected.
  }
}
