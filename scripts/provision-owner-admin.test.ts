import { describe, expect, it } from "vitest";

import { ownerProvisioningInput } from "./provision-owner-admin.mjs";

const VALID_ENVIRONMENT = {
  NODE_ENV: "production",
  ALLOW_OWNER_PROVISIONING: "true",
  DATABASE_URL: "postgresql://user:secret@database.internal/chezcardb?schema=public",
  PROVISION_OWNER_DATABASE: "chezcardb",
  PROVISION_OWNER_EMAIL: "owner@chezcar.test",
  PROVISION_OWNER_PASSWORD: "temporary-owner-password",
  PROVISION_OWNER_NAME: "Chezcar Owner",
};

describe("ownerProvisioningInput", () => {
  it("accepts an explicitly confirmed production target", () => {
    expect(ownerProvisioningInput(VALID_ENVIRONMENT)).toMatchObject({
      expectedDatabase: "chezcardb",
      email: "owner@chezcar.test",
      name: "Chezcar Owner",
    });
  });

  it.each([
    { NODE_ENV: "development" },
    { ALLOW_OWNER_PROVISIONING: undefined },
    { PROVISION_OWNER_DATABASE: "other_database" },
    { DATABASE_URL: "https://database.internal/chezcardb" },
    { PROVISION_OWNER_EMAIL: "admin@example.invalid" },
    { PROVISION_OWNER_PASSWORD: "short" },
  ])("refuses unsafe environment %#", (override) => {
    expect(() =>
      ownerProvisioningInput({ ...VALID_ENVIRONMENT, ...override }),
    ).toThrow();
  });
});
