-- An order already paid in full issues no receipt when the goods are released:
-- no money changes hands, so there is no paper to write. The sale still exists,
-- because the goods did move and the warranty starts, and it carries the order
-- reference for identity. This flag is what tells it apart from a sale whose
-- manualReceiptNumber is a real handwritten receipt.
--
-- Every existing sale was created from a receipt, so the default is correct for
-- all of them and no backfill is needed.
ALTER TABLE "Sale" ADD COLUMN "receiptIssued" BOOLEAN NOT NULL DEFAULT true;
