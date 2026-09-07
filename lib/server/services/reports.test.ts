import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", () => ({ prisma: {} }));

let reports: typeof import("./reports");

beforeAll(async () => {
  reports = await import("./reports");
});

describe("report filters", () => {
  it("uses an Asia/Manila month-to-date sales period", () => {
    expect(reports.defaultReportDates(new Date("2026-09-07T18:00:00Z"))).toEqual({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-08",
    });
  });

  it("parses focused filters and rejects reversed or impossible dates", () => {
    expect(reports.queryFromSearchParams(new URLSearchParams("type=sales&source=DIRECT_SALE&paymentMethod=GCASH"))).toMatchObject({
      type: "sales",
      source: "DIRECT_SALE",
      paymentMethod: "GCASH",
    });
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=inventory-movements&dateFrom=2026-09-08&dateTo=2026-09-07"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&dateFrom=2026-02-30"))).toThrow();
  });
});
