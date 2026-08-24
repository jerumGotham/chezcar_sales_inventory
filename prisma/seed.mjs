import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

const locations = [
  { code: "WH-MAIN", name: "Main Warehouse", type: "WAREHOUSE" },
  { code: "BR-QC", name: "QC Main", type: "BRANCH" },
  { code: "BR-MKT", name: "Makati", type: "BRANCH" },
  { code: "BR-PSG", name: "Pasig", type: "BRANCH" },
];

const products = [
  ["ITM-0001", "3M Tint Medium Black", "Tint", "8500", "ACTIVE", "Premium medium black tint for SUVs and sedans"],
  ["ITM-0002", "Seat Cover Set", "Seat Cover", "6000", "ACTIVE", "Leatherette seat cover set"],
  ["ITM-0003", "Android Head Unit 9in", "Audio", "12500", "ACTIVE", "Touchscreen Android head unit with CarPlay"],
  ["ITM-0004", "LED Fog Lamp Set", "Lighting", "3500", "ACTIVE", "Bright LED fog lamps for better visibility"],
  ["ITM-0005", "Roof Rack", "Exterior", "9500", "INACTIVE", "Heavy duty roof rack"],
  ["ITM-0006", "Nano Ceramic Tint", "Tint", "14500", "ACTIVE", "High heat rejection ceramic tint"],
  ["ITM-0007", "Amplifier 4 Channel", "Audio", "7800", "ACTIVE", "4-channel car amplifier"],
  ["ITM-0008", "Premium Seat Cover Beige", "Seat Cover", "7200", "ACTIVE", "Premium beige seat cover set"],
  ["ITM-0009", "LED Headlight Bulb", "Lighting", "2200", "ACTIVE", "LED headlight bulb pair"],
  ["ITM-0010", "Rear Spoiler", "Exterior", "6800", "INACTIVE", "Sporty rear spoiler"],
];

const balances = [
  ["ITM-0001", "WH-MAIN", 30, 0, 5, "6200"],
  ["ITM-0001", "BR-QC", 8, 2, 5, "6200"],
  ["ITM-0001", "BR-MKT", 4, 1, 5, "6200"],
  ["ITM-0002", "WH-MAIN", 22, 0, 4, "4100"],
  ["ITM-0002", "BR-QC", 3, 1, 4, "4100"],
  ["ITM-0002", "BR-PSG", 0, 0, 4, "4100"],
  ["ITM-0003", "WH-MAIN", 12, 0, 5, "9000"],
  ["ITM-0003", "BR-MKT", 2, 1, 5, "9000"],
  ["ITM-0004", "WH-MAIN", 18, 0, 3, "2400"],
  ["ITM-0005", "WH-MAIN", 7, 0, 2, "7100"],
  ["ITM-0006", "BR-QC", 3, 1, 4, "11000"],
  ["ITM-0006", "BR-PSG", 1, 0, 4, "11000"],
];

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim();

  if (!email || !password || !name) {
    throw new Error(
      "SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_NAME are required",
    );
  }

  if (email.endsWith(".invalid") || password.startsWith("replace-with")) {
    throw new Error("Replace the example Admin credentials before seeding");
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", status: "ACTIVE", locationId: null },
    create: {
      email,
      emailVerified: true,
      name,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  const passwordHash = await hashPassword(password);

  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: user.id,
      },
    },
    update: { password: passwordHash, userId: user.id },
    create: {
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    },
  });
}

async function main() {
  const locationByCode = new Map();
  const productByCode = new Map();

  for (const location of locations) {
    const record = await prisma.location.upsert({
      where: { code: location.code },
      update: location,
      create: location,
    });
    locationByCode.set(location.code, record.id);
  }

  for (const [itemCode, name, category, price, status, description] of products) {
    const record = await prisma.product.upsert({
      where: { itemCode },
      update: { name, category, price, status, description },
      create: { itemCode, name, category, price, status, description },
    });
    productByCode.set(itemCode, record.id);
  }

  for (const [itemCode, locationCode, onHand, reserved, reorderLevel, unitCost] of balances) {
    const productId = productByCode.get(itemCode);
    const locationId = locationByCode.get(locationCode);

    await prisma.inventoryBalance.upsert({
      where: { locationId_productId: { locationId, productId } },
      update: { onHand, reserved, reorderLevel, unitCost },
      create: {
        productId,
        locationId,
        onHand,
        reserved,
        reorderLevel,
        unitCost,
      },
    });
  }

  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
