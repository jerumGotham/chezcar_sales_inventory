# Transaction and Inventory Flows

This is the quick reference for testing the implemented transactions manually. It starts with products, users, roles, and locations already present but with no inventory balances.

Job Orders and the supporting POS Job Order panel are not included because they still use mock or page-local behavior.

## Inventory Terms

| Term | Meaning |
| --- | --- |
| On Hand | Physical quantity recorded at one location. |
| Reserved | Quantity held for customer orders. |
| Available | `On Hand - Reserved`; this is the quantity available for a new sale or reservation. |
| Unit Cost | Latest recorded cost for the product at that location. |
| Movement | Audit entry showing why inventory increased, decreased, or changed. |

Every inventory balance belongs to one product and one location. Permissions determine which action a user may perform. **Access All Locations** or the user's assigned locations determine which records the user may access.

## Recommended Empty-Inventory Start

Run the operational reset without running the seed afterward:

```bash
npm run db:data:reset
```

This preserves products, users, credentials, roles, and locations but removes operational transactions, inventory movements, and inventory balances.

Do not run `npm run db:seed` afterward if the goal is zero starting inventory. The seed restores the reviewed opening balances.

## Complete Sample Flow

Use one product named **Sample Oil** and the locations **Stock Room**, **QC**, and **LU**.

### 1. Receive Supplier Stock

Post a supplier receipt for 100 units at PHP 50 unit cost.

| Location | On Hand | Reserved | Available | Unit Cost |
| --- | ---: | ---: | ---: | ---: |
| Stock Room | 100 | 0 | 100 | 50 |
| QC | 0 | 0 | 0 | - |
| LU | 0 | 0 | 0 | - |

Movement: `SUPPLIER_RECEIPT +100` at Stock Room.

The receipt creates the Stock Room balance when none exists. A later supplier receipt adds to On Hand and replaces Unit Cost with the latest received cost; it does not calculate a weighted average.

### 2. Transfer 30 Units to QC

Create and finalize a transfer from Stock Room to QC. Draft creation and finalization do not change inventory.

Dispatch the transfer:

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| Stock Room | 70 | 0 | 70 |
| QC | 0 | 0 | 0 |

Movement: `TRANSFER_DISPATCH -30` at Stock Room. The 30 units are now in transit and are not sellable.

QC confirms exact receipt:

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| Stock Room | 70 | 0 | 70 |
| QC | 30 | 0 | 30 |

Movement: `TRANSFER_RECEIPT +30` at QC.

### 3. Create a QC Customer Reservation for 5 Units

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| QC | 30 | 5 | 25 |

Inventory movement: none. Reservation changes the balance and order in one transaction but does not represent physical stock movement.

### 4. Record the Customer Payment

Payment and manual receipt records change. Inventory remains:

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| QC | 30 | 5 | 25 |

### 5. Release the Customer Order

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| QC | 25 | 0 | 25 |

Movement: `CUSTOMER_ORDER_RELEASE -5` at QC.

Release decreases both On Hand and Reserved. Available stays at 25 because the five units were already unavailable while reserved. The same transaction completes the order and creates the sale and accounting-review records.

### 6. Post a Direct Customer Sale for 3 Units

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| QC | 22 | 0 | 22 |

Movement: `DIRECT_SALE -3` at QC.

The direct sale checks Available stock, creates the sale, receipt, line snapshots, and accounting-review row, and deducts inventory in one transaction.

### 7. Accounting Verification

Marking the sale verified or reporting a mismatch does not change inventory.

If Accounting later voids and replaces the three-unit sale with a corrected two-unit sale:

1. Reverse original sale: `SALE_CORRECTION_REVERSAL +3`.
2. Post replacement sale: `SALE_CORRECTION -2`.
3. Final QC On Hand becomes 23.

Net effect: `+3 - 2 = +1` compared with the original sale posting.

### 8. Manual Adjustment

If one damaged unit must be removed from QC:

| Location | On Hand | Reserved | Available |
| --- | ---: | ---: | ---: |
| QC | 22 | 0 | 22 |

Movement: `MANUAL_ADJUSTMENT -1` with the entered reason and reference.

The system rejects a decrease that would make `On Hand < Reserved`.

## Transaction Reference

### Supplier Receiving

Posting point: supplier receipt creation.

```text
On Hand = On Hand + Received Quantity
Reserved = unchanged
Unit Cost = latest received Unit Cost
```

- Destination is always the active Stock Room (`SR`).
- Creates the balance if it does not exist.
- Writes `SUPPLIER_RECEIPT +quantity` for every line.
- Duplicate receipt references and invalid products reject the whole transaction.

### Direct or POS Sale

Posting point: successful checkout.

```text
Required: Available >= Sale Quantity
On Hand = On Hand - Sale Quantity
Reserved = unchanged
Available = Available - Sale Quantity
```

- Writes `DIRECT_SALE -quantity` for every line.
- Inline customer creation, sale, receipt, review, balance updates, and movements are atomic.
- Payment must equal the server-calculated total.
- A failed checkout does not deduct partial inventory.

### Customer Order

#### Reservation Order Creation

```text
Required: Available >= Order Quantity
On Hand = unchanged
Reserved = Reserved + Order Quantity
Available = Available - Order Quantity
```

No Inventory Movement is created because stock has not physically left the branch.

#### Waiting-Stock Order Creation

No inventory effect. The order stays `WAITING_STOCK` until stock becomes available and an authorized user reserves it.

#### Reserve Waiting-Stock Order

Uses the same formula as reservation creation. All lines reserve together or none do.

#### Record Payment

Updates payment, remaining balance, and optional manual receipt only. No inventory effect.

#### Final Release

```text
Required: Reserved >= Order Quantity and On Hand >= Order Quantity
On Hand = On Hand - Order Quantity
Reserved = Reserved - Order Quantity
Available = unchanged
```

- Writes `CUSTOMER_ORDER_RELEASE -quantity`.
- Completes the order and creates its sale and accounting review.
- Requires the exact remaining payment and a unique final receipt.

#### Cancel Reserved Order

```text
On Hand = unchanged
Reserved = Reserved - Order Quantity
Available = Available + Order Quantity
```

No Inventory Movement is created. Cancelling a waiting-stock order also has no inventory effect.

### Stock Transfer

#### Create, Edit, Delete, or Finalize Draft

No inventory effect. These actions prepare the transfer document.

#### Dispatch from Stock Room

```text
Required: Stock Room Available >= Dispatch Quantity
Stock Room On Hand = Stock Room On Hand - Dispatch Quantity
In Transit = Dispatch Quantity
```

Writes `TRANSFER_DISPATCH -quantity` at Stock Room.

#### Exact Branch Receipt

```text
Branch On Hand = Branch On Hand + In-Transit Quantity
In Transit = 0
```

Writes `TRANSFER_RECEIPT +quantity` at the destination. The destination balance is created when none exists.

#### Report Discrepancy

Records actual counts and reasons but does not post inventory. Stock remains in transit.

#### Submit Investigation

Records findings but does not post inventory.

#### Resolve Discrepancy

Every in-transit unit must be allocated:

```text
Destination Quantity + Restore-to-Stock-Room Quantity + Loss Quantity
= In-Transit Quantity
```

| Allocation | Balance effect | Movement |
| --- | --- | --- |
| Destination | Add to destination On Hand | `TRANSFER_RESOLUTION +quantity` |
| Return to Stock Room | Add back to Stock Room On Hand | `TRANSFER_RESTORATION +quantity` |
| Loss | No balance receives the units | `TRANSFER_LOSS -quantity` |

The complete allocation posts atomically and clears In Transit.

### Accounting Receipt Review

| Action | Inventory effect |
| --- | --- |
| Verify receipt | None |
| Report mismatch | None |
| Branch response | None |
| Confirm original encoding correct | None |
| Void and replace sale | Reverse original quantities, then deduct replacement quantities |

Void-and-replace formula for the same product:

```text
Final On Hand = Current On Hand + Original Quantity - Replacement Quantity
Reserved = unchanged
```

Movements are `SALE_CORRECTION_REVERSAL +original` and `SALE_CORRECTION -replacement`.

### Inventory Quantity Correction

```text
Increase: On Hand = On Hand + Quantity
Decrease: On Hand = On Hand - Quantity
Reserved = unchanged
```

Writes a signed `MANUAL_ADJUSTMENT` movement. A reason is required.

### Inventory Unit-Cost Update

```text
On Hand = unchanged
Reserved = unchanged
Unit Cost = new Unit Cost
```

Writes a zero-quantity `MANUAL_ADJUSTMENT` movement as an audit entry.

### Offline Sale

- Device activation has no inventory effect.
- Snapshot only reads Available stock; it does not reserve stock.
- Successful sync uses the normal direct-sale transaction and writes `DIRECT_SALE -quantity`.
- Duplicate receipt or insufficient stock becomes a review/conflict result without deducting inventory.
- The POS offline queue is currently disabled even though the server endpoints remain implemented.

## Actions With No Inventory Effect

| Action | Persisted result |
| --- | --- |
| Customer create/update/deactivate | Customer master record only |
| Product create/update/status/image | Product master or private image only |
| Order payment | Payment and receipt records only |
| Accounting verify/mismatch/response | Review and notification records only |
| Transfer draft/finalize/discrepancy/investigation | Transfer status and audit records only |
| Notification read/unread actions | Notification state only |
| User, role, branch, password, and status changes | Administration and session records only |

## Movement Summary

| Movement type | Signed quantity | Meaning |
| --- | ---: | --- |
| `SUPPLIER_RECEIPT` | Positive | Supplier stock entered Stock Room |
| `DIRECT_SALE` | Negative | Direct/POS or synchronized offline sale |
| `CUSTOMER_ORDER_RELEASE` | Negative | Reserved customer order physically released |
| `TRANSFER_DISPATCH` | Negative | Stock left Stock Room and became in transit |
| `TRANSFER_RECEIPT` | Positive | Exact transfer entered destination branch |
| `TRANSFER_RESOLUTION` | Positive | Discrepancy allocation entered destination |
| `TRANSFER_RESTORATION` | Positive | Discrepancy allocation returned to Stock Room |
| `TRANSFER_LOSS` | Negative | In-transit quantity resolved as loss |
| `SALE_CORRECTION_REVERSAL` | Positive | Original sale quantity restored |
| `SALE_CORRECTION` | Negative | Replacement sale quantity deducted |
| `MANUAL_ADJUSTMENT` | Positive, negative, or zero | Quantity correction or cost-change audit |

## Safety Rules

- Inventory-changing workflows validate the exact action permission and location access on the server.
- New sales and reservations use Available stock, not raw On Hand.
- One invalid line rejects the complete transaction.
- Business document, inventory changes, movements, and in-transaction notifications roll back together for the main online workflows.
- Menu visibility is not authorization.
- Seed and operational reset are development maintenance operations, not normal audited inventory transactions.
