// Safety guard shared by destructive database scripts (reset.mjs, seed.mjs --force).
// A destructive script on a Supabase/production database would be catastrophic, so BOTH must hold:
//   1. ALLOW_DB_RESET=true is set explicitly in the environment
//   2. the DATABASE_URL host is localhost / 127.0.0.1 / ::1
export function assertLocalOrExplicit(what) {
  const host = new URL(process.env.DATABASE_URL).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!local || process.env.ALLOW_DB_RESET !== 'true') {
    console.error(`Refusing "${what}": requires ALLOW_DB_RESET=true AND a local DATABASE_URL (host is "${host}"). Supabase databases are never reset by scripts.`);
    process.exit(1);
  }
}
