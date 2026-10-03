import { useEffect, type RefObject } from 'react';

/** Fades [data-reveal] children in as they enter the viewport. No-op under prefers-reduced-motion. */
export function useReveal(root: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const targets = [...el.querySelectorAll<HTMLElement>('[data-reveal]:not([data-reveal="shown"])')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = 'shown';
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    for (const t of targets) {
      if (t.getBoundingClientRect().top > window.innerHeight * 0.92) t.dataset.reveal = 'pending';
      io.observe(t);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
