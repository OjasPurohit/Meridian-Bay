import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const shell =
  'group bg-background relative inline-flex min-h-11 w-auto max-w-full cursor-pointer items-center justify-center overflow-hidden rounded-full border border-primary/40 p-2 px-6 text-center font-semibold whitespace-nowrap text-foreground transition-transform duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60';

function Inner({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <div className="bg-primary h-2 w-2 shrink-0 rounded-full transition-all duration-300 group-hover:scale-[100.8] group-focus-visible:scale-[100.8]"></div>
        <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0 group-focus-visible:translate-x-12 group-focus-visible:opacity-0">
          {children}
        </span>
      </div>
      {/* Same footprint as the resting label (text + 1rem icon ≈ dot + gap), so the swap never clips. */}
      <div
        aria-hidden="true"
        className="text-primary-foreground absolute inset-0 z-10 flex translate-x-12 items-center justify-center gap-2 px-6 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
      >
        <span>{children}</span>
        <ArrowRight className="size-4 shrink-0" />
      </div>
    </>
  );
}

export function InteractiveHoverButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(shell, className)} {...props}>
      <Inner>{children}</Inner>
    </button>
  );
}

/** Same interaction for in-page anchors and external hrefs. */
export function InteractiveHoverLink({ children, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn(shell, className)} {...props}>
      <Inner>{children}</Inner>
    </a>
  );
}

/** Same interaction for client-side routes. */
export function InteractiveHoverRouteLink({ children, className, ...props }: LinkProps) {
  return (
    <Link className={cn(shell, className)} {...props}>
      <Inner>{children}</Inner>
    </Link>
  );
}
