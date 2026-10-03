# Frontend — Meridian Bay

> **Status:** public homepage built (`features/public`), reading `mock-data/*.json` through `src/api/public.ts`. Role dashboards are still to be built. This file is the **layout contract** so four developers can build screens in parallel without editing each other's files.

**Run:** `cd frontend && npm install && npm run dev` (http://localhost:5173) · `npm run build` typechecks and bundles. Design tokens live in `src/index.css` (`@theme`); photo slots use `components/ui/PlaceholderArt.tsx` until real photography is supplied (pass `src`).

**Stack (ADR-008):** React 18 · Vite · TypeScript · React Router · TanStack Query · Tailwind CSS. Types, enums, error codes, money/time helpers come from `/shared` (alias `@shared/*`). Network contract: [API_CONTRACT.md](../docs/api/API_CONTRACT.md) (`docs/api/openapi.yaml` can generate a client if wanted).

```
frontend/
  index.html  vite.config.ts  tsconfig.json  (paths: "@shared/*" -> ../shared/*)
  src/
    main.tsx  App.tsx      providers + router that AUTO-LOADS every features/*/routes.ts   (Dev 1)
    api/
      client.ts            fetch wrapper: base URL, Bearer token, unwraps {success,data,meta}, throws ApiError(code)   (Dev 1)
      <module>.ts          typed functions per endpoint, e.g. bookings.create(body: BookingsCreateRequest): Promise<BookingDetail>   (module owner)
    auth/                  AuthProvider, useAuth(), <RequireRole roles=[...]>, role redirect (ROLE_HOME_ROUTE)   (Dev 1)
    layouts/               PublicLayout, MemberLayout, FrontDeskLayout, KitchenLayout, BusinessLayout, OwnerLayout   (Dev 1; menus read from each feature's routes.ts)
    components/ui/         Button, Input, Table, Modal, Badge, Money, DateTime, EmptyState, ErrorState, Spinner   (Dev 1)
    features/<module>/     ONE FOLDER PER FEATURE — owned by one developer
      routes.ts            export default [{ path, role, element, nav? }]   (auto-discovered)
      pages/  components/  hooks/   (TanStack Query hooks wrap api/<module>.ts)
    lib/format.ts          wraps shared/lib/money.ts + time.ts for display (₹, IST)
```

## Screens per role (route prefixes come from `ROLE_HOME_ROUTE`)

| Role | Home | Main screens (owner) |
|---|---|---|
| Visitor | `/` | Home, Plans, Courts + availability, Shop, Bar menu, Social play, Trial/Enquiry, Login, Signup (Dev 1; availability widget Dev 2; shop Dev 3) |
| MEMBER | `/member` | Overview + profile/plan/expiry (Dev 1); Book/cancel court + Social play (Dev 2); Shop + orders (Dev 3); Bar activity/tabs (Dev 3); Payments/receipts (Dev 4) |
| FRONT_DESK | `/front-desk` | Member search/register/history + Bookings + Social (Dev 2); Enquiries/CRM (Dev 1); Shop counter + Bar POS + Tabs (Dev 3); Schedule/leave (Dev 4) |
| KITCHEN_MANAGER | `/kitchen` | Kitchen board only (Dev 3) |
| BUSINESS_CLIENT | `/business` | Invoices, pay, history (Dev 4) |
| OWNER_ADMIN | `/owner` | Dashboard + Reports + Finance + Invoices + Staff/HR + Settings (Dev 4); Plans/Courts admin (Dev 2); Products/Inventory/Menu admin (Dev 3) |

## Rules
1. **Never hardcode membership behaviour.** Show what the API returns (`active_membership`, `plan.benefits`, `member_price`, `PriceBreakdown`). No `if (type === 'GOLD')` pricing in the UI.
2. **Never re-declare** enums, error codes, status strings or types — import from `@shared/...`. No `userId`/`memberId`: field names are exactly the API's `snake_case`.
3. **Money/date display** only through `lib/format.ts` (₹ with Indian grouping; IST). Never do money arithmetic in floats — use `@shared/lib/money`.
4. **Errors:** every mutation shows `error.message` for the `code` (map in one place) and every list handles loading / empty / error. 401 → logout + redirect to `/login`.
5. **Role guards are UX only.** The server enforces permissions. Hide what a role cannot use, but never rely on it.
6. **Add routes by creating `features/<module>/routes.ts`** — do not edit `App.tsx`. Add API functions in your own `api/<module>.ts`.
7. While the backend is unfinished, develop against `mock-data/*.json` shapes (identical to the row types) behind the same `api/<module>.ts` functions, then flip to real calls.
8. Polling intervals: kitchen board 5 s, member bookings/orders on focus, notifications badge 30 s (ADR-010).
