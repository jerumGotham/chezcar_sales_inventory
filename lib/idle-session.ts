export const IDLE_LOGOUT_MS = 10 * 60 * 1_000;
export const IDLE_ACTIVITY_STORAGE_KEY = "chezcar:last-activity-at";

export function idleTimeRemaining(
  lastActivityAt: number,
  now = Date.now(),
  timeoutMs = IDLE_LOGOUT_MS,
): number {
  return Math.max(0, lastActivityAt + timeoutMs - now);
}
