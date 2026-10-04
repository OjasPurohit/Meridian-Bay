# Frontend — Meridian Bay

> **Status:** public site built (`features/public`, `shop`, `membership`, `bar-cafe`) **and all five role dashboards built** (`features/dashboards`) on a client-side demo store seeded from `mock-data/*.json`. The API is not wired yet. This file is also the **layout contract** so four developers can extend screens in parallel without editing each other's files.

**Run:** `cd frontend && npm install && npm run dev` (http://localhost:5173) · `npm run build` typechecks and bundles.

**Backend switch:** `npm run dev` talks to the API at `http://localhost:4000` by default (override with `VITE_API_BASE_URL` in `frontend/.env.local`); `npm run dev:preview` starts the no-backend preview on purpose. Unset = no backend: login/sign-up report that accounts aren't connected, and the role dashboards (`/member`, `/owner`, `/front-desk`, `/business`, `/kitchen`) open as labelled previews of `mock-data`. Set = dashboards require a real session with the matching role (`src/auth`, `src/features/dashboards`); the API must still enforce every permission server-side. Design tokens live in `src/index.css` (`@theme`); photo slots use `components/ui/PlaceholderArt.tsx` until real photography is supplied (pass `src`).

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
| Visitor | `/` | Home, Plans, Courts + availability, Shop, Cafe menu, Trial/Enquiry, Login, Signup (Dev 1; availability widget Dev 2; shop Dev 3) |
| MEMBER | `/member` | Overview + profile/plan/expiry (Dev 1); Book/cancel court (Dev 2); Shop + orders (Dev 3); Cafe orders (Dev 3); Payments/receipts (Dev 4) |
| FRONT_DESK | `/front-desk` | Member search/register/history + Bookings (Dev 2); Enquiry inbox (Dev 1); Shop counter + Cafe orders (Dev 3); Schedule/leave (Dev 4) |
| KITCHEN_MANAGER | `/kitchen` | Kitchen board only (Dev 3) |
| STORE_MANAGER | `/store-manager` | Products, stock, shop orders |
| OWNER_ADMIN | `/owner` | Dashboard + Reports + Finance + Invoices + Staff/HR + Settings (Dev 4); Plans/Courts admin (Dev 2); Products/Inventory/Menu admin (Dev 3) |

## Rules
1. **Never hardcode membership behaviour.** Show what the API returns (`active_membership`, `plan.benefits`, `member_price`, `PriceBreakdown`). No `if (type === 'GOLD')` pricing in the UI.
2. **Never re-declare** enums, error codes, status strings or types — import from `@shared/...`. No `userId`/`memberId`: field names are exactly the API's `snake_case`.
3. **Money/date display** only through `lib/format.ts` (₹ with Indian grouping; IST). Never do money arithmetic in floats — use `@shared/lib/money`.
4. **Errors:** every mutation shows `error.message` for the `code` (map in one place) and every list handles loading / empty / error. 401 → logout + redirect to `/login`.
5. **Role guards are UX only.** The server enforces permissions. Hide what a role cannot use, but never rely on it.
6. **Add routes by creating `features/<module>/routes.ts`** — do not edit `App.tsx`. Add API functions in your own `api/<module>.ts`.
7. While the backend is unfinished, develop against `mock-data/*.json` shapes (identical to the row types) behind the same `api/<module>.ts` functions, then flip to real calls.
8. Polling intervals: kitchen board 5 s, member bookings/orders on focus (ADR-010).

## Role dashboards (`src/features/dashboards`)

One sidebar layout (`layout/DashboardLayout.tsx`) wraps every role; the role comes from the URL prefix (`ROLE_HOME_ROUTE`). Pages are lazy-loaded and registered in `routes.ts`; the sidebar items live in `layout/nav.ts`.

| Role | Routes |
|---|---|
| Member `/member` | `/` court calendar + booking, `/store`, `/kitchen`, `/events` |
| Front desk `/front-desk` | `/` full court calendar, `/bookings`, `/members`, `/payments` |
| Business client `/business` | `/` overview (P&L, KPIs, charts), `/invoices`, `/history`, `/partners`, `/store` (CRUD) |
| Kitchen manager `/kitchen` | `/` POS, `/orders` live board, `/history`, `/invoices`, `/stock`, `/products` (CRUD) |
| Owner `/owner` | `/` overview, `/analytics`, `/members`, `/memberships`, `/bookings`, `/store`, `/kitchen`, `/payments`, `/staff`, `/events`, `/enquiries`, `/reports` (CSV) |

**Shared building blocks** — `ui/kit.tsx` (cards, KPI with count-up, tabs, tables, drawer/modal, toasts, skeletons, stepper), `ui/charts.tsx` (dependency-free SVG area/bar/donut/sparkline), `ui/forms.tsx` (one create/edit form + delete confirm for all CRUD), `components/CourtCalendar.tsx` (the booking calendar, `mode="member" | "desk"`: members never see who booked a slot). All of it uses the existing design tokens in `src/index.css`; new motion utilities are appended there (`.anim-*`, `.card-lift`, `.skeleton`) and collapse under `prefers-reduced-motion`.

**Demo data store** (`store/`) — `seed.ts` + `staticData.ts` build state from `mock-data` (plus a deterministic generated history for charts); `demoStore.ts` is the only place state changes (`demo.bookCourt`, `demo.placeShopOrder`, `demo.setKitchenStatus`, …) and applies the same rules as `docs/business-rules` (30-min grid, no double booking, max plays/day, plan discounts, atomic stock). It persists to `localStorage` and syncs across tabs, so a member's order shows up on the kitchen board in another tab. **To connect the real API**, replace the `demo.*` actions and `useDemo()` selectors with calls in `src/api/<module>.ts`; page components do not need to change shape. "Reset demo data" is in the user menu.

**Temporary one-click demo login** — `src/features/demo` (accounts, session, `/demo` page, dropdown block). To remove it: delete that folder and the two lines marked `DEMO` in `src/auth/AuthProvider.tsx` and `src/auth/LoginMenu.tsx`.

The calendar is plain React/CSS (fast, accessible, no 3D runtime). A Spline scene was deliberately not embedded: it would add a heavy runtime and a failure mode to the one screen that must never lag.
