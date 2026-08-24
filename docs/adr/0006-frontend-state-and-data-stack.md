# ADR 0006: Frontend State and Data Stack

**Status:** Proposed
**Date:** 2026-08-24

## Context

The current prototype already uses React 19, TanStack Query, Tailwind CSS, shadcn-style Base UI/Radix primitives, Lucide, Recharts, and local React state. Existing queries call page-local mock functions rather than the mock HTTP endpoints.

The production MVP will add authenticated APIs, complex forms, URL-driven list views, realtime notification updates, and limited offline PWA behavior. Without clear state ownership, the application could duplicate server data across TanStack Query, Zustand, form state, local storage, and IndexedDB.

## Recommended Decision

### Server State: TanStack Query

Continue using TanStack Query for API-backed data:

- Queries own products, inventory, sales, transfers, users, notifications, and reports received from the server.
- Mutations call typed Next.js APIs and invalidate or update the smallest relevant query keys.
- Query keys include every server-side filter, branch scope, page, sort, and cursor.
- Realtime SSE events invalidate or patch TanStack Query entries; they do not create a parallel server-state store.
- Persisted/offline query caching is added only for explicitly approved branch-scoped snapshots.

### HTTP Client: Native `fetch`

Use a small typed wrapper around native `fetch` rather than Axios by default:

- Next.js and browsers already provide `fetch`.
- Same-origin cookie authentication, `AbortSignal`, streaming/SSE support, and Next.js server behavior work without another runtime dependency.
- The wrapper should parse the standard API envelope, map typed errors, set JSON headers, and support idempotency keys.
- Do not hide cache semantics or error handling behind a large generic API abstraction.

Axios should be introduced only if a concrete requirement such as request/response interceptor behavior, upload progress, or compatibility with an external SDK clearly outweighs a second HTTP abstraction.

### Local and Shared Client State

Use local React state by default for dialogs, tabs, expanded rows, and temporary UI choices.

Use URL search parameters for shareable list state:

- search
- filters
- pagination
- sort order
- selected report periods where appropriate

Zustand is optional and should be introduced only for small cross-route, client-only state that does not belong to the server, URL, form, or IndexedDB. Possible examples are a POS draft/cart presentation store or connectivity/sync-status projection.

Zustand must not become the authoritative store for:

- API records already owned by TanStack Query
- authentication/authorization
- posted sales or inventory
- durable offline operation queues
- form field state

### Forms and Validation

Add these direct dependencies when the first production form is implemented:

- `zod`
- `react-hook-form`
- `@hookform/resolvers`

Use Zod contracts at API boundaries and reuse appropriate input schemas in forms. Server validation remains authoritative. React Hook Form is appropriate for sales, receiving, transfers, discrepancy evidence, and administrative forms; simple one-field controls can remain controlled React inputs.

The lockfile currently contains Zod only as a transitive dependency. It must be added explicitly before application code imports it.

### Offline Persistence

Use IndexedDB for durable branch-scoped snapshots, command queue entries, idempotency metadata, and sync results. A small IndexedDB library such as Dexie is preferred over hand-written IndexedDB callbacks.

- IndexedDB is the durable local store.
- Zustand may expose reactive UI state derived from IndexedDB but cannot replace it.
- TanStack Query cache persistence is for read snapshots, not queued business commands.
- Local storage is limited to non-sensitive preferences and cannot hold authoritative sales or inventory operations.
- A Next.js-compatible service-worker integration such as Serwist should handle app-shell/static-asset caching after its compatibility with the upgraded Next.js version is verified.

Offline support is implemented as a dedicated phase, not by globally persisting every query.

### UI and Presentation

Preserve the existing visual stack:

- Tailwind CSS and current semantic tokens
- existing shadcn-style Base UI/Radix primitives
- Lucide icons
- Recharts for dashboard/report charts
- `next/link`, `next/image`, and App Router navigation

Do not add another component framework. Add TanStack Table only if server-driven sorting, column visibility, selection, or reusable table composition becomes difficult with the current tables; it is not required merely to render rows.

Use native `Intl.NumberFormat` and `Intl.DateTimeFormat` initially. Add a date library only when domain date arithmetic or timezone behavior exceeds those APIs.

### User Feedback and Errors

- Use inline field errors for validation.
- Use the existing dialog/alert primitives for decisions and destructive confirmations.
- Add one lightweight toast primitive, such as Sonner through the existing shadcn setup, for completed background actions and sync status.
- Provide route-level loading/error boundaries and focused empty/error states for every API-backed screen.
- Do not rely on toasts as the only record of failed offline operations; durable failures appear in a review/sync interface.

### Frontend Verification

Before production workflows are implemented, add:

- Vitest for deterministic unit tests
- React Testing Library and `user-event` for component behavior
- MSW for API contract/error/loading simulations
- Playwright for critical role-based online and offline workflows

Exact versions are selected during implementation after the Next.js security upgrade.

## State Ownership Summary

| Concern | Owner |
| --- | --- |
| API/server records | TanStack Query |
| Form values/errors | React Hook Form + Zod |
| Shareable filters/paging | URL search parameters |
| Dialogs/tabs/temporary UI | Local React state |
| Rare cross-route UI state | Zustand, only when demonstrated |
| Durable offline queue/snapshots | IndexedDB/Dexie |
| Authentication and authorization | Server session/policies |
| Realtime delivery | SSE feeding TanStack Query/notifications |

## Consequences

### Positive

- Each kind of state has one clear owner.
- Avoids duplicating API data in Zustand.
- Avoids Axios when the platform already supplies the needed HTTP client.
- Keeps offline evidence durable and separate from transient UI state.
- Builds on dependencies and patterns already present in the repository.

### Negative

- Developers must maintain discipline around query keys and avoid copying query data into stores.
- IndexedDB/service-worker logic needs explicit versioning and migration tests.
- Shared Zod schemas must not import server-only implementation details into client bundles.

## Deferred Choices

- Whether Zustand is needed at all; decide when the POS/offline UI state is designed.
- Exact authentication library and session mechanism.
- Exact service-worker package after upgrading Next.js and checking compatibility.
- Whether advanced tables justify TanStack Table.
- Whether browser push is enabled after the durable in-app notification system works.
