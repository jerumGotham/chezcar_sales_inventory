import { describe, expect, it } from "vitest";

import { listTransfersQuerySchema } from "./stock-transfers";

function parse(input: Record<string, string | undefined>) {
  return listTransfersQuerySchema.safeParse(input);
}

describe("listTransfersQuerySchema", () => {
  it("leaves every date out when none is given", () => {
    const result = parse({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ page: 1, pageSize: 10 });
    expect(result.data?.dispatchedFrom).toBeUndefined();
    expect(result.data?.deliveredTo).toBeUndefined();
  });

  it("accepts one end of a range on its own", () => {
    expect(parse({ dispatchedFrom: "2026-11-01" }).success).toBe(true);
    expect(parse({ deliveredTo: "2026-11-30" }).success).toBe(true);
  });

  it("accepts a single day as both ends", () => {
    expect(parse({ deliveredFrom: "2026-11-14", deliveredTo: "2026-11-14" }).success).toBe(true);
  });

  it("refuses a range that ends before it starts", () => {
    const dispatched = parse({ dispatchedFrom: "2026-11-30", dispatchedTo: "2026-11-01" });
    const delivered = parse({ deliveredFrom: "2026-11-30", deliveredTo: "2026-11-01" });

    expect(dispatched.success).toBe(false);
    expect(dispatched.error?.issues[0]).toMatchObject({ path: ["dispatchedTo"] });
    expect(delivered.success).toBe(false);
    expect(delivered.error?.issues[0]).toMatchObject({ path: ["deliveredTo"] });
  });

  it("checks the two ranges independently", () => {
    // A good dispatch range must not excuse a backwards delivery range.
    const result = parse({
      dispatchedFrom: "2026-11-01",
      dispatchedTo: "2026-11-30",
      deliveredFrom: "2026-11-30",
      deliveredTo: "2026-11-01",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["deliveredTo"] });
  });

  it("refuses a day that does not exist", () => {
    // new Date would roll this into March, filtering on a day nobody asked
    // for rather than saying the input was wrong.
    expect(parse({ dispatchedFrom: "2026-02-31" }).success).toBe(false);
    expect(parse({ dispatchedFrom: "2026-13-01" }).success).toBe(false);
  });

  it("refuses anything that is not a plain calendar day", () => {
    expect(parse({ deliveredFrom: "14-11-2026" }).success).toBe(false);
    expect(parse({ deliveredFrom: "2026-11-14T00:00:00Z" }).success).toBe(false);
    expect(parse({ deliveredFrom: "today" }).success).toBe(false);
  });
});
