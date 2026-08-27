ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "reorderLevel" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" AS product
SET "reorderLevel" = COALESCE((
  SELECT MAX(balance."reorderLevel")
  FROM "InventoryBalance" AS balance
  WHERE balance."productId" = product.id
), 0)
WHERE product."reorderLevel" = 0;
