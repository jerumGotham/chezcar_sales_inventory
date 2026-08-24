# Chezcar System Discovery Questionnaire

> The current working product direction is documented in [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md). Use this broader questionnaire only to resolve deferred details or expand scope; it is not necessary to answer every question before the MVP can be planned.

Pwede itong sagutan in one message. For multiple-choice questions, okay ang format na `1-B, 2-A, 3-C`. Kapag wala sa choices ang sagot, ilagay lang ang actual workflow or preferred setup.

## Current Understanding for Confirmation

Pakicorrect kung may mali sa current understanding:

1. Internal cloud-based sales and inventory monitoring system ito.
2. Hindi ito customer-facing POS at hindi ito ang gagamitin para mag-print ng official receipt or invoice.
3. Handwritten receipt pa rin ang ibibigay sa customer.
4. Every sale should eventually be recorded in the system and should deduct stock.
5. Main problems to solve are stock discrepancies and remote sales monitoring.
6. Branch staff can view system stock and compare it with actual stock, but they cannot directly edit quantities.
7. Stock additions and deductions are controlled by the owner or an authorized central team.

## Business and Scope

1. Ilang branches ang gagamit sa launch? May main warehouse ba bukod sa branches?
2. Ano ang pinaka-importanteng result after the first version: accurate stock, sales visibility, branch accountability, or all three?
3. Aling features ang required sa first release: Sales/POS, Inventory, Receiving, Transfers, Customer Orders, Job Orders, Reports, Users/Roles, Notifications?
4. May existing process ba na dapat gayahin exactly, or okay na baguhin ang workflow kung mas controlled at auditable?
5. Sino ang final decision-maker kapag may conflict sa process or data: owner, operations head, inventory head, or ibang tao?

## Users and Permissions

6. Ano ang actual user roles? Example: Owner, Central Inventory Staff, Branch Manager, Cashier/Sales Staff, Installer/Technician.
7. Shared account ba per branch or individual account per employee?
8. Dapat ba makita ng branch users ang sarili nilang branch only, while owner/central team can see all branches?
9. Sino ang puwedeng gumawa, edit, void, or cancel ng sale?
10. Sino ang puwedeng receive stock, request transfer, approve transfer, dispatch, and confirm receipt?
11. Sino ang puwedeng gumawa at mag-approve ng stock adjustment? Puwede bang i-approve ng requester ang sariling request?
12. Kailangan bang makita sa history kung sinong user ang gumawa, nag-edit, nag-approve, at anong oras?

## Sales and Handwritten Receipts

13. Kailan dapat i-record ang sale: A) before item release, B) after writing the receipt, C) end of day, D) flexible kapag may internet issue?
14. One system transaction ba per customer/receipt, or puwedeng total sales summary lang at end of day?
15. Required bang i-encode ang handwritten receipt number sa bawat sale?
16. May receipt-number sequence ba per branch, at kailangan bang mag-alert sa duplicate or missing receipt numbers?
17. Ano ang payment methods: cash, GCash, bank transfer, card, split payment, utang/credit?
18. Kailangan bang i-record ang discount? Sino ang puwedeng magbigay ng discount at may approval limit ba?
19. Allowed ba ang guest/walk-in sale na walang customer profile?
20. Kapag maling item, quantity, price, or payment ang na-encode, puwede bang i-edit ang sale or dapat void then create a corrected sale?
21. Ano ang process para sa return, exchange, refund, cancelled sale, at damaged item?
22. Kapag na-void or na-return ang sale, automatic bang ibabalik ang item sa stock? Paano kung damaged at hindi sellable?
23. May services/labor ba sa normal sale, or sa Job Order lang dapat iyon?

## Products and Pricing

24. Ano ang unique identifier ng item: SKU/item code, barcode, product name, or combination?
25. Same selling price ba across all branches, or may branch-specific prices?
26. Sino ang puwedeng gumawa/edit ng product, selling price, category, and reorder level?
27. Kailangan bang i-track ang unit cost and profit/margin, or sales amount and quantity lang?
28. May serial-number, batch, size, color, vehicle compatibility, or other variants bang kailangang i-track?

## Inventory Control

29. Ano ang official stock locations: main warehouse, branches, stockroom, display area, damaged area, or iba pa?
30. Ano ang stock formula na gusto ninyo: on-hand, reserved, available, damaged, and in-transit quantities?
31. Anong events lang ang dapat gumalaw ng stock: receiving, sale, return, adjustment, transfer dispatch/receipt, customer-order reservation, job-order usage?
32. Puwede bang mag-negative stock ang sale, or dapat blocked kapag kulang ang available quantity?
33. Kapag may customer order pero wala pang stock, dapat bang mag-reserve ng existing quantity or waiting list lang?
34. Kailangan bang makita ang complete stock card/history per item and location?
35. Gaano kadalas ginagawa ang physical count: daily, weekly, monthly, or on demand?

## Stock Discrepancies and Adjustments

36. Kapag magkaiba ang system at actual count, ano ang branch workflow: A) report only, B) submit actual count, C) request exact adjustment, D) ibang process?
37. Anong details ang required sa discrepancy: actual count, expected count, variance, reason, photo, remarks, at witness?
38. Sino ang mag-iinvestigate at sino ang final approver ng adjustment?
39. Kapag approved, automatic bang mag-adjust ang stock, or central team pa rin ang magpo-post manually?
40. Kailangan bang may separate reasons such as encoding error, theft/loss, damaged, unrecorded sale, wrong receiving, or count correction?
41. Dapat bang bawal burahin ang adjustment at correction entry na lang ang gamitin para complete ang audit history?
42. Gusto ba ninyo ng alert kapag lumampas sa quantity/value threshold ang discrepancy or paulit-ulit ang variance sa isang branch?

## Receiving and Suppliers

43. Saan usually pumapasok ang new stock: main warehouse only, direct to branch, or both?
44. Sino ang nag-eencode at sino ang nagco-confirm ng receiving?
45. Anong reference ang ginagamit: supplier delivery receipt, purchase order, invoice, or manual reference number?
46. Kailangan bang i-record ang supplier, unit cost, delivered quantity, damaged quantity, at photo ng delivery document?
47. Puwede bang partial delivery, over-delivery, or short delivery? Ano ang approval process?

## Stock Transfers

48. Sino ang puwedeng mag-request ng transfer: source branch, destination branch, central team, or owner only?
49. Ano ang preferred flow: request, approve, prepare, dispatch, in transit, receive, close?
50. Kailan mababawas sa source stock: approval, dispatch, or destination receipt?
51. Habang in transit, kailangan bang visible as separate in-transit stock?
52. Ano ang mangyayari kapag kulang, sobra, damaged, or wrong item ang natanggap ng destination?
53. Puwede bang partial receive, reject, or return-to-source?

## Customer Orders and Downpayments

54. Kailangan ba talaga ang Customer Order module sa first release, or puwedeng later phase?
55. Kailan ginagamit ang customer order instead of normal sale?
56. Required ba ang downpayment? May minimum amount or percentage ba?
57. Kailan mare-reserve at kailan mababawas ang stock: order creation, full payment, or actual release?
58. Ano ang cancellation/refund policy at sino ang puwedeng mag-approve?
59. Kailangan bang mag-alert kapag ready for release, overdue, or matagal nang unclaimed?

## Job Orders and Services

60. Kailangan ba ang Job Order module sa first release?
61. Ano ang minimum job-order details: customer, vehicle, branch, service, labor, parts, technician, schedule, notes?
62. Kailan mababawas ang parts: kapag assigned, installed/used, or completed ang job?
63. Ano ang statuses at sino ang puwedeng mag-transition: pending, ongoing, for release, completed, cancelled?
64. Kasama ba ang labor/service fees sa sales monitoring and daily branch totals?

## Reports, Dashboard, and Alerts

65. Ano ang top five numbers na gustong makita ng owner remotely every day?
66. Kailangan bang makita ang sales by branch, cashier, date, payment method, product, category, and service?
67. Kailangan bang makita ang expected cash versus encoded cash sales per branch?
68. Ano ang important inventory alerts: low stock, out of stock, negative stock attempt, unapproved adjustment, transfer delay, repeated discrepancy?
69. Kailangan bang mag-export to Excel/CSV/PDF? Aling reports ang regularly ginagamit?
70. Kailangan bang may daily closing report per branch? Sino ang magsa-submit at sino ang magre-review?

## Connectivity and Operations

71. Stable ba ang internet sa lahat ng branches?
72. Kapag walang internet, okay bang hindi makapag-transact temporarily, or required ang offline encoding then sync later?
73. Anong devices ang gagamitin: desktop, laptop, tablet, phone, barcode scanner?
74. Ilang users ang expected sabay-sabay gumamit?
75. May preferred hosting/cloud provider ba, or okay na irecommend based on cost and support?
76. Sino ang magha-handle ng user accounts, password reset, product setup, and ongoing system support?

## Existing Data and Rollout

77. Nasaan ang current data: Google Sheets, Excel, paper records, or combination?
78. Anong data ang kailangang i-import: products, opening stock, branches, users, customers, prices, historical sales?
79. Gaano ka-clean at updated ang current product codes and stock quantities?
80. Bago mag-live, magkakaroon ba ng physical count para iyon ang maging official opening balance?
81. Pilot branch muna ba or sabay-sabay lahat ng branches?
82. Kailangan bang parallel muna with Google Sheets habang tine-test ang system? If yes, gaano katagal?
83. Sino ang mag-aapprove na accurate na ang opening stock at ready na ang branch for go-live?

## Priority and Success Criteria

84. Ano ang three must-have workflows para masabing useful na ang first release?
85. Ano ang features na definitely puwedeng ipagpaliban?
86. After one month of use, paano natin masasabing successful ang system? Example: fewer unexplained variances, daily sales visible remotely, no direct branch stock edits, faster reconciliation.
87. May target launch date, budget range, or operational deadline ba na dapat sundin?

## Important Compliance Confirmation

88. Please confirm: handwritten official receipts remain the business's customer and tax document, while this system is for internal monitoring only.
89. Sino ang accounting or tax adviser na magco-confirm kung anong sales records, retention, and reports ang kailangan? The software scope should not assume that being internal automatically removes regulatory obligations.
