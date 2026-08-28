import { describe, expect, it, vi } from "vitest";

import { markHeaderNotificationRead } from "./header-notifications";

describe("header notification requests", () => {
  it("resolves only when the read request succeeds", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(markHeaderNotificationRead("notice/1", request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith("/api/notifications/notice%2F1/read", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("surfaces the API error when the read request fails", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(
      { error: { message: "Notification update failed" } },
      { status: 500 },
    ));

    await expect(markHeaderNotificationRead("notice-1", request)).rejects.toThrow("Notification update failed");
  });
});
