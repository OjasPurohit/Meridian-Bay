# Browser end-to-end tests (manual)

These drive the real app in a headless browser against a **scratch clone** of the local `champions_club` database, so they
can create members, applications and products freely. The real data is never written. They are not part of `npm test`
(they need PostgreSQL, a browser and ~5 minutes).

```
npm i --no-save playwright-core            # once; set CHROMIUM_PATH to an installed chrome/chromium if needed
node tools/e2e/scratch-env.mjs up          # clones champions_club -> champions_club_e2e, starts API :4001 and web :5175
node tools/e2e/ui.cjs                      # signup, pending login, owner approve/reject, deactivation, products, address, menu
node tools/e2e/live-sync.cjs                # events owner->member (polling, register), new court owner->desk+member, kitchen READY->PREPARING, no popups
node tools/e2e/demo-login.cjs              # the 5 demo buttons = real login in live mode (E2E_WEB=:5173, E2E_API=:4000; read-only), mock in preview (E2E_PREVIEW=1)
node tools/e2e/calendar-views.cjs         # trial request panel -> approve/decline -> owner Day/Week/Month calendar -> front desk
node tools/e2e/desk-booking-sync.cjs     # front desk books an empty slot + takes cash -> court_bookings/payments rows, calendar, Collected today, owner calendar, reload
node tools/e2e/trial-pos.cjs              # public Book a trial -> owner/desk calendars, owner court count, POS member lookup + Gold price, all owner pages
node tools/e2e/owner-pages.cjs            # read-only on the live stack (E2E_WEB=:5173): every owner page, three roles in three tabs
node tools/e2e/popup.cjs                   # repeated-popup regression (5 roles x 36 s, forced 500 / ACCOUNT_DISABLED)
node tools/e2e/api.mjs                     # cafe order lifecycle, server-side member price, one menu
node tools/e2e/scratch-env.mjs down        # stops the servers and drops the scratch database
```

`scratch-env.mjs` reads `DATABASE_URL` from the git-ignored `.env` and never prints it. Needs `pg_dump` / `pg_restore`
(`PG_BIN` = their folder).
