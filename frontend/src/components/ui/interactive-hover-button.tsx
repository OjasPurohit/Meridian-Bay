import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const shell =
  'group bg-background relative inline-flex min-h-11 w-auto cursor-pointer items-center justify-center overflow-hidden rounded-full border border-primary/40 p-2 px-6 text-center font-semibold text-foreground';

function Inner({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <div className="bg-primary h-2 w-2 rounded-full transition-all duration-300 group-hover:scale-[100.8] group-focus-visible:scale-[100.8]"></div>
        <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0 group-focus-visible:translate-x-12 group-focus-visible:opacity-0">
          {children}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover:-translate-x-5 group-hover:opacity-100 group-focus-visible:-translate-x-5 group-focus-visible:opacity-100"
      >
        <span>{children}</span>
        <ArrowRight className="size-4" />
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

/** Same interaction for navigation targets, so links stay real anchors. */
export function InteractiveHoverLink({ children, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn(shell, className)} {...props}>
      <Inner>{children}</Inner>
    </a>
  );
}
