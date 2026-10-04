import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

const STALE_MODULE = /dynamically imported module|Importing a module script failed|error loading dynamically/i;
const RELOAD_KEY = 'mb.stale-reload';

/**
 * Route error screen. A lazy page that fails to load because the browser holds a stale module graph (the dev server or
 * a deployment changed under an open tab) is fixed by one reload; everything else gets a readable page, not the router default.
 */
export default function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Something went wrong.';
  const stale = STALE_MODULE.test(message);

  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === location.href) return; // already tried once for this URL
      sessionStorage.setItem(RELOAD_KEY, location.href);
    } catch {
      return;
    }
    location.reload();
  }, [stale]);

  return (
    <main className="grid min-h-svh place-items-center bg-sand px-5 text-ink">
      <div role="alert" className="max-w-md text-center">
        <p className="eyebrow text-olive-mid">{stale ? 'Page out of date' : 'Something went wrong'}</p>
        <h1 className="display mt-3 text-3xl">{stale ? 'This page needs a refresh' : 'This page could not be shown'}</h1>
        <p className="mt-3 text-sm text-muted">{stale ? 'The app was updated while this tab was open.' : message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => location.reload()} className="inline-flex min-h-11 items-center rounded-full bg-olive px-5 text-sm font-semibold text-chalk">Reload</button>
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 text-sm font-semibold">Home</Link>
        </div>
      </div>
    </main>
  );
}
