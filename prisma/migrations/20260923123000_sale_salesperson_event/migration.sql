-- Correcting the salesperson credited on a posted sale keeps the person who
-- was credited before, the same way a customer order already does.
CREATE TABLE "SaleSalespersonEvent" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "previousSalespersonId" TEXT,
    "previousSalespersonName" TEXT,
    "previousSalespersonLocationId" TEXT,
    "previousSalespersonLocationCode" TEXT,
    "previousSalespersonLocationName" TEXT,
    "newSalespersonId" TEXT NOT NULL,
    "newSalespersonName" TEXT NOT NULL,
    "newSalespersonLocationId" TEXT NOT NULL,
    "newSalespersonLocationCode" TEXT NOT NULL,
    "newSalespersonLocationName" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleSalespersonEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleSalespersonEvent_saleId_occurredAt_idx" ON "SaleSalespersonEvent"("saleId", "occurredAt");

ALTER TABLE "SaleSalespersonEvent" ADD CONSTRAINT "SaleSalespersonEvent_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleSalespersonEvent" ADD CONSTRAINT "SaleSalespersonEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
