export async function markHeaderNotificationRead(
  id: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? "Unable to mark notification as read.");
  }
}
