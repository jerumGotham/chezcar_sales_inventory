-- Products are bought from a supplier, shown as "Brand" in the UI. The link is
-- optional: a product may have no supplier. The existing brand text stays as the
-- denormalised name beside it, the way SupplierClaim keeps supplierName.
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;

CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;
