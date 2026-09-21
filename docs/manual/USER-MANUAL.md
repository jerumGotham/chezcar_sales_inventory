# Sales, Inventory & Monitoring System — User Manual

This manual walks through every screen and transaction in the system. The screenshots come from a real run against a working database, not mockups.

**How access works.** Two things decide what a person can do. Their **role** decides which actions they may perform, and their **assigned locations** decide where. Both must allow an action. A role with "Receive inventory" still cannot receive anywhere unless a branch is assigned to that account.

---

## Contents

1. [Signing in](#1-signing-in)
2. [Dashboard](#2-dashboard)
3. [Customers](#3-customers)
4. [POS: posting a sale](#4-pos-posting-a-sale)
5. [Receipt verification](#5-receipt-verification)
6. [Customer orders](#6-customer-orders)
7. [Products](#7-products)
8. [Inventory](#8-inventory)
9. [Receiving from a supplier](#9-receiving-from-a-supplier)
10. [Stock transfers](#10-stock-transfers)
11. [Returns and warranty](#11-returns-and-warranty)
12. [Reports](#12-reports)
13. [Audit trail](#13-audit-trail)
14. [Branch, supplier and personnel maintenance](#14-branch-supplier-and-personnel-maintenance)
15. [Roles and users](#15-roles-and-users)
16. [Notifications](#16-notifications)

---

## 1. Signing in

Every person signs in with their own account. Shared logins are not allowed, because the system records the name of whoever performed each action.

![Sign in](images/01-sign-in.png)

After signing in, the name and role appear at the top right of every screen. The role shown there explains what the account can and cannot do.

---

## 2. Dashboard

The dashboard summarises the locations assigned to the signed-in account.

![Dashboard](images/02-dashboard.png)

- **Available Stock** counts available units across your locations.
- **Supplier Receipts Today** counts deliveries posted today in your locations.
- **Low / Out Stock** lists products at or below their reorder level.
- **Notifications** shows unread alerts for your account.

---

## 3. Customers

Customers are shared across branches. The list shows status, last transaction, branch, and total spend.

![Customer list](images/03-customers.png)

**To add a customer**, press **Add Customer**, fill in the name and contact details, then save.

![Customer form](images/20-customer-form.png)
![Customer details filled](images/21-customer-form-filled.png)
![Customer saved](images/22-customer-saved.png)

A customer is never deleted. Use **Deactivate** instead: the record stays for history but cannot be picked for new transactions. Reactivate the same way.

---

## 4. POS: posting a sale

POS records a sale that already happened on a handwritten receipt. Posting deducts branch stock immediately, so the entry must match the paper receipt.

**Step 1. Choose the selling branch.** Products and stock come from this branch. Type to narrow the list, then pick the branch.

![POS](images/23-pos-empty.png)
![Branch selected](images/24-pos-branch-selected.png)

**Step 2. Find the product.** Search by item code, name, or category.

![Product search](images/25-pos-product-search.png)

**Step 3. Add to the cart** and set the quantity.

![Cart](images/26-pos-cart.png)

**Step 4. Complete the sale details.** Customer, salesperson, payment method, the handwritten receipt number, any discount, and optionally a photo of the receipt.

![Ready to post](images/27-pos-ready.png)

**Step 5. Review and confirm.** The confirmation lists everything before anything is saved.

![Confirmation](images/28-pos-confirmation.png)
![Posted](images/29-pos-after-post.png)

What the system does on posting: it creates the sale, deducts stock at that branch, records a stock movement, adds the sale to the verification queue, and alerts anyone whose stock has fallen to its reorder level. Stock can never go below zero.

---

## 5. Receipt verification

Every receipt the business issues waits here until someone checks it against the paper. The screen has two tabs, because there are two kinds of receipt.

### Sale Receipts

Every posted sale waits here until someone checks it against the paper receipt.

![Verification queue](images/72-verification-queue.png)

Press **Review** to open the sale beside its evidence.

![Verification detail](images/73-verification-detail.png)

**A sale cannot be verified without the receipt photo.** Until one is attached, both Confirm correct and Report mismatch stay disabled and the panel says the evidence is pending. Choose the file, then press **Attach receipt photo**.

![Photo selected](images/74-verification-photo-selected.png)
![Photo attached](images/75-verification-photo-attached.png)

Then decide:

- **Confirm correct** when the encoded sale matches the receipt. The sale becomes Verified and counts in the sales report.
- **Report mismatch** when it does not. The branch can respond, and an authorised user resolves it, keeping the sale or voiding and replacing it.

![Confirmed](images/76-verification-confirmed.png)

Posted sales are never deleted. A correction is an auditable void-and-replace.

### Payment Receipts

Downpayments and later order payments come here instead. They are money received before any sale exists, so they have their own receipt and their own check. The cycle is the same but shorter: there are no item lines to compare, only the amount and the receipt number.

1. Pick the receipt from the list. The panel shows what the branch recorded: the amount, the payment method, the customer, the order, the order total, and the balance right now.
2. **Attach the receipt photo.** Confirm Correct and Report Mismatch stay disabled until one is there.
3. Enter what the paper actually says — the amount and the receipt number — then **Confirm Correct**, or **Report Mismatch** with a reason and notes.
4. A mismatch goes to the branch, which files its finding. Only then can it be resolved: **Confirm As Recorded** accepts the branch's answer and verifies the receipt, while **Void Payment** cancels it and puts the amount back on the order balance so the branch can record it again with the right receipt.

A verified payment counts in the Sales report on the day it was verified. A voided one stays on the list marked Voided with its reason, and counts nowhere.

A receipt that settles a sale — a direct sale, or the balance paid at release — is checked on the Sale Receipts tab, never here. The same piece of paper is never reviewed twice.

## 6. Customer orders

An order is a booking made before the goods leave: a reservation, a reservation with downpayment, or a waiting-stock order.

![Orders](images/32-customer-orders-list.png)

**Step 1. Open Create Order** and fill the header: branch, customer, salesperson, and order type.

![Order form](images/60-order-create-form.png)
![Header filled](images/61-order-header-filled.png)

**Step 2. Add the items** with quantities. Prices come from the catalogue.

![Item added](images/62-order-item-added.png)

**Step 3. Save Order.** The order appears in the list with its balance and status.

![Order saved](images/63-order-saved.png)

**The row buttons** change with the order's state.

![Row actions](images/64-orders-with-row-actions.png)

**Downpayment and later payments.** Press **Downpayment**, or **Add Payment** once one exists. Each payment takes an amount, its payment method, and **its own receipt number, which is required** — the payment cannot be saved without one, because Accounting has to check that receipt against its photo.

![Payment dialog](images/65-order-payment-dialog.png)
![Payment filled](images/66-order-payment-filled.png)
![Payment recorded](images/67-order-payment-recorded.png)

The order then reads Partial, with total paid and remaining balance. Every payment is a separate line in the audit trail, including the first downpayment, and every one of them turns up on the Payment Receipts tab of Receipt Verification for checking.

**Reserve Stock** holds the units for this customer. Available stock drops, on hand does not, so nobody else can sell the reserved pieces.

![Reserved](images/68-order-reserved.png)

**Release** hands the goods over. It asks for the final handwritten receipt number and any remarks.

![Release page](images/69-order-release-page.png)
![Release filled](images/70-order-release-filled.png)
![Released](images/71-order-released.png)

On release the system deducts stock, clears the reservation, records the final receipt, and completes the order. The release receipt covers only the balance paid that day; the downpayment and any payments before it were already counted on their own receipts, so the order's total is never counted twice.

**Cancel** is available until release. An order with a downpayment requires a cancellation note.

## 7. Products

The catalogue holds item codes, names, categories, brands, selling prices, reorder levels, warranty duration, images, and vehicle fitment.

![Products](images/07-products.png)

**Add Product** opens the form. Item code and name are required; price, reorder level, warranty months, and an image are optional.

![Product form](images/81-product-form.png)
![Product filled](images/82-product-form-filled.png)
![Product created](images/83-product-created.png)

**Find a product** with the item code or name filter, then **Apply Filters**.

![Filtered](images/84-products-filtered.png)

**Edit** changes any field, including the selling price.

![Edit price](images/85-product-edit-price.png)
![Saved](images/86-product-price-saved.png)

A price change is recorded in the audit trail with the old and the new value. **Delete** works only while a product has no balances and no history; otherwise set its status to inactive.

---

## 8. Inventory

Inventory shows stock per location for the branches you are assigned to.

![Inventory](images/08-inventory.png)

**View** expands a product to show each branch holding it.

![Expanded](images/77-inventory-expanded.png)

- **Total on hand** is everything physically there, including quarantined units.
- **Available** excludes reserved and quarantined units, and is what POS can sell.
- **Quarantined** units are physically present but not sellable.

**Adjust Stock** corrects a count. Pick the inventory balance, which names the product and its location, then the adjustment type, the quantity, a reference, and a reason. The reason is required.

![Adjust dialog](images/78-inventory-adjust-dialog.png)
![Adjust filled](images/79-inventory-adjust-filled.png)
![Adjust saved](images/80-inventory-adjust-saved.png)

Every adjustment becomes a stock movement carrying the reference, the reason, and the person who made it. **Edit Cost** updates the unit cost the same way. **Stock Movement** and **Inventory Availability** open the history and the per-branch availability views.

---

## 9. Receiving from a supplier

A delivery is received at the location that physically took it.

![Receive from supplier](images/09-receive-from-supplier.png)

**Receive To** is fixed to your branch when you have one, and becomes a choice when you have several. You can only receive into a location assigned to you.

Fill in the receipt reference, supplier, and one line per product: expected, accepted, quarantined, and missing quantities, plus unit cost. Expected must equal accepted plus quarantined plus missing.

![Receipt filled](images/48-receive-filled.png)
![Receipt posted](images/49-receive-posted.png)

What happens on posting:

- Accepted and quarantined units increase on hand; only quarantined units also increase quarantine.
- Missing units change no stock.
- Any quarantined or missing line automatically opens a draft supplier claim.
- Everyone at that location, plus admins, gets a notification that stock arrived.

---

## 10. Stock transfers

A transfer moves stock from one location to a branch. Any location you are assigned to can be the source, and any active branch can be the destination. Source and destination cannot be the same.

![Stock transfers](images/10-stock-transfers.png)

**Step 1. Create the draft.** Choose source and destination, then add products and quantities. With one assigned location the source is filled in for you. Products come from the selected source, and changing the source clears the lines.

![Draft form](images/50-transfer-draft-form.png)
![Draft created](images/51-transfer-draft-created.png)

**Step 2. Finalize**, which locks the draft for dispatch. A draft can also be edited or deleted until then.

![Finalized](images/52-transfer-finalized.png)

**Step 3. Dispatch.** Stock leaves the source now, not on arrival. The quantities become in transit and cannot be sold at either end.

![Dispatched](images/53-transfer-dispatched.png)

**Step 4. The destination counts the delivery.** Only the receiving branch sees these two actions, and only the sending side sees cancel.

![Incoming](images/54-branch-incoming-transfer.png)
![Checklist](images/115-branch-count-checklist.png)

- **Confirm exact receipt** when the count matches. Stock lands at the destination and the transfer is complete.

![Received](images/56-branch-transfer-received.png)

- **Report discrepancy** when it does not. Enter what actually arrived and what happened. Nothing moves yet.

![Short count](images/116-branch-short-count.png)
![Discrepancy form](images/117-branch-discrepancy-form.png)
![Reported](images/118-branch-discrepancy-reported.png)

**Step 5. The sending side investigates.** Open the flagged transfer, write the findings, and submit.

![Review](images/119-admin-discrepancy-review.png)
![Findings](images/120-admin-investigation-form.png)
![Submitted](images/121-admin-investigation-submitted.png)

**Step 6. Post the stock resolution.** Every missing piece must be accounted for: delivered to the destination, returned to the source, or written off as loss. Stock moves only when this is posted.

![Resolution form](images/122-admin-resolution-form.png)
![Resolution filled](images/123-admin-resolution-filled.png)
![Resolved](images/124-admin-resolution-posted.png)

In the run shown, six pieces left Quezon City, four arrived at Biñan, and two were written off. The movements record exactly that: minus six at the source, plus four at the destination, and a two-piece loss.

**Cancelling** an in-transit transfer returns every in-transit piece to the source and needs a reason. Only the sending side can cancel.

The list can be filtered by reference, source, destination, and status.

---

## 11. Returns and warranty

Three case types share this screen: backjobs, customer warranties, and supplier claims.

![Backjobs](images/96-backjob-list.png)

### Backjob: rework on something already sold

**Step 1. New Backjob.** Pick the posted sale, tick the purchased item, and describe the concern.

![Backjob form](images/92-backjob-form.png)
![Sale selected](images/93-backjob-sale-selected.png)
![Concern filled](images/94-backjob-filled.png)

The draft opens on its own page with the customer, receipt, and branch already filled.

![Backjob draft](images/95-backjob-created.png)

**Step 2. Schedule** it: choose the installer and the date and time.

![Schedule](images/98-backjob-schedule-filled.png)
![Scheduled](images/99-backjob-scheduled.png)

**Step 3. Decide coverage**, covered or chargeable, and save it. A chargeable case records the amount and the charge sale.

![Coverage saved](images/101-backjob-coverage-saved.png)

![In progress](images/100-backjob-in-progress.png)

**Step 4. Start work**, then record what was done, how the customer acknowledged it, and who acknowledged it.

![Work recorded](images/102-backjob-work-recorded.png)

**Complete Backjob** closes the case. It stays disabled until the work performed and the acknowledging name are filled.

![Completed](images/103-backjob-completed.png)

Parts issued to a backjob are deducted from branch stock, and unused parts are returned the same way. **Print** produces the form for the customer. A draft can be cancelled or rejected with a reason.

### Customer warranty: an item returned under warranty

**Step 1. Create the claim.** Pick the purchased item from a verified sale; the customer, product, and branch fill themselves. Enter the claim quantity and the concern. When the product has no warranty duration on file, the owner must state the warranty basis in months and why.

![Warranty form](images/104-warranty-form.png)
![Warranty filled](images/105-warranty-filled.png)
![Warranty created](images/106-warranty-created.png)

Creating a claim changes no stock yet.

![Warranty list](images/107-warranty-list.png)
![Case timeline](images/97-backjob-detail.png)
![Warranty detail](images/108-warranty-detail.png)

**Step 2. Confirm item received.** Only now does the item enter quarantine at that branch: present in on hand, excluded from available.

![Received](images/109-warranty-received.png)

**Step 3. Approve repair or replacement** with a target date, or reject the claim.

![Target date](images/110-warranty-target-date.png)
![Approved](images/111-warranty-approved.png)

**Step 4. Mark ready for pickup**, then **Confirm handover to customer**, then **Complete claim**.

![Ready](images/112-warranty-ready.png)
![Handed over](images/113-warranty-handed-over.png)
![Completed](images/114-warranty-completed.png)

**Return unrepaired item** is there for a claim the customer takes back before any decision.

### Supplier claim: damaged or missing stock from a delivery

![Supplier claims](images/41-returns-supplier-claims.png)

A claim opens automatically whenever a supplier receipt records quarantined or missing units. From the claim you can send stock back to the supplier, receive a replacement, or record a repair, and each step keeps its own record.

---

## 12. Reports

Four read-only reports, each limited to the locations you may see, each exportable to PDF.

![Sales report](images/35-reports-sales.png)
![Sales by salesperson](images/36-reports-salesperson.png)
![Inventory summary](images/37-reports-inventory.png)
![Returns and warranty](images/38-reports-returns.png)

- **Sales** counts every verified receipt on the day Accounting verified it, filtered by date, branch, salesperson, source, and payment method. The Source column says which kind of receipt each row is: Direct Sale, Order Downpayment, Order Payment, or Order Release. A ₱50,000 order paid ₱10,000 down, ₱5,000 later, and ₱35,000 at release appears as three rows adding to exactly ₱50,000 — nothing is counted twice. An order cancelled after a verified downpayment still shows that forfeited amount, because the money was never returned. Units and discounts sit on the receipt that completed the sale, so a downpayment row shows zero units. Voided receipts count nowhere.
- **Sales by Salesperson** groups the same receipts by the personnel recorded at the time.
- **Inventory Summary** shows current available stock per branch.
- **Returns & Warranty** covers cases by date.

Filters stay pending until you press **Apply Filters**.

---

## 13. Audit trail

Admin only. One time-ordered list of everything that happened.

![Audit trail](images/58-audit-trail-list.png)

It covers sign-ins, failed sign-ins and sign-outs; master data changes to products, customers, suppliers, personnel, branches, users and roles; sales and corrections; receipt verification; order bookings and payments; every stock movement; transfers at each step; and returns and warranty events.

**View** opens the full detail: who, when, which branch, the items involved, and for transfers, both ends of the route.

![Audit entry details](images/59-audit-entry-details.png)

Filter by module, date range, or free text.

---

## 14. Branch, supplier and personnel maintenance

**Branches.** Add a branch at any time with its code and name. New branches appear immediately as transfer destinations and as receiving locations.

![Branches](images/14-branch-maintenance.png)
![Branch form](images/43-branch-form.png)

**Suppliers.** Code, name, contact person, number, email, address, and notes.

![Suppliers](images/15-supplier-maintenance.png)
![Supplier filled](images/87-supplier-form-filled.png)
![Supplier created](images/88-supplier-created.png)

**Personnel** are salespersons and installers. They do not sign in; they are named on sales, orders, and backjobs.

![Personnel](images/16-personnel-maintenance.png)
![Personnel form](images/89-personnel-form.png)
![Personnel filled](images/90-personnel-form-filled.png)
![Personnel created](images/91-personnel-created.png)

Suppliers and personnel are deactivated, never deleted, so past records keep their names. **Deactivate** and **Edit** sit on each row.

---

## 15. Roles and users

**Roles** decide what an account may do. Permissions are grouped by menu entry and read in sidebar order, so a role is checked the same way it is used.

![Roles](images/17-role-maintenance.png)
![Role permissions](images/47-role-permissions.png)

Two permissions worth knowing: the Stock Transfers group separates sending actions (create, finalize, dispatch, cancel) from receiving actions (receive, report discrepancy). A branch that both sends and receives needs both.

Changing a role's permissions signs out everyone assigned to it.

**Users** hold the account itself: name, email, role, and assigned locations.

![Users](images/18-user-management.png)
![User form](images/46-user-form.png)

A user is deactivated, never deleted, and deactivation ends their sessions immediately.

---

## 16. Notifications

Alerts reach only the people they concern: the branch involved, plus admins and business-wide accounts. Other branches are not disturbed.

![Notifications](images/57-branch-notifications.png)

Alerts cover stock arrivals, incoming transfers, discrepancies, low stock, and receipt verification work. **Open** jumps to the record behind the alert.

---

## Appendix: rules that never bend

- Stock can never go below zero, online or offline.
- Posted sales and completed transfers are never hard-deleted; corrections are recorded as corrections.
- Users, customers, suppliers, personnel, and used products are deactivated, not deleted, so history keeps its names.
- Every stock change carries a product, quantity, location, reason, person, and time.
- Hiding a button is not security. Every action is checked again on the server.
