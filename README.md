# Chezcar UI Starter

Starter UI for a car accessories sales and inventory system using:
- Next.js App Router
- Tailwind CSS
- ShadCN-style component structure
- Prisma
- PostgreSQL

## Included screens
- Dashboard
- Customers
- Products
- Inventory
- Customer Orders
- POS / Sales
- Job Orders
- Stock Transfers
- Reports
- Notifications
- Users & Roles
- Settings

## Run locally

```bash
npm install
cp .env.example .env
npx prisma generate
npm run dev
```

## Suggested next build order
1. App shell and navigation
2. Dashboard widgets
3. Customer master and details page
4. Product master and branch inventory
5. Customer order flow with downpayment
6. POS screen and sale posting
7. Job order flow
8. Stock transfer approval flow
9. Users and roles
10. Settings and supporting tables

## Notes
- Current API routes return mock data.
- Prisma schema is a starter only and can be expanded.
- UI is prepared for quotation/demo scope first.
