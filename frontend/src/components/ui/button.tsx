import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { InteractiveHoverLink, InteractiveHoverRouteLink } from './interactive-hover-button';

/**
 * One vocabulary for actions:
 *  primary   — the InteractiveHoverButton pill (one per view where possible)
 *  secondary — quiet outlined pill
 *  text      — underlined text action with an arrow
 * `tone="dark"` adapts secondary/text for olive or ink backgrounds.
 */
export type ActionVariant = 'primary' | 'secondary' | 'text';
type Tone = 'light' | 'dark';

const secondary: Record<Tone, string> = {
  light: 'border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-chalk',
  dark: 'border-chalk/40 text-chalk hover:border-chalk hover:bg-chalk hover:text-ink',
};

const text: Record<Tone, string> = {
  light: 'text-ink decoration-ink/30 hover:decoration-ink',
  dark: 'text-chalk decoration-chalk/40 hover:decoration-chalk',
};

export function actionClass(variant: Exclude<ActionVariant, 'primary'>, tone: Tone = 'light', className?: string) {
  if (variant === 'secondary') {
    return cn(
      'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full border px-6 py-2 text-center font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97]',
      secondary[tone],
      className,
    );
  }
  return cn(
    'group/text inline-flex min-h-11 items-center gap-2 font-semibold underline decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-200 active:opacity-70',
    text[tone],
    className,
  );
}

interface CommonProps {
  variant?: ActionVariant;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

function Label({ variant, children }: { variant: ActionVariant; children: ReactNode }) {
  if (variant !== 'text') return <>{children}</>;
  return (
    <>
      {children}
      <ArrowRight className="size-4 shrink-0 transition-transform duration-200 group-hover/text:translate-x-1" aria-hidden="true" />
    </>
  );
}

/** Client-side route action. */
export function ActionLink({ variant = 'primary', tone = 'light', className, children, ...props }: CommonProps & Omit<LinkProps, 'className' | 'children'>) {
  if (variant === 'primary') {
    return (
      <InteractiveHoverRouteLink className={cn(tone === 'dark' && 'border-transparent', className)} {...props}>
        {children}
      </InteractiveHoverRouteLink>
    );
  }
  return (
    <Link className={actionClass(variant, tone, className)} {...props}>
      <Label variant={variant}>{children}</Label>
    </Link>
  );
}

/** In-page anchor action (e.g. #catalogue). */
export function ActionAnchor({ variant = 'primary', tone = 'light', className, children, ...props }: CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>) {
  if (variant === 'primary') {
    return (
      <InteractiveHoverLink className={cn(tone === 'dark' && 'border-transparent', className)} {...props}>
        {children}
      </InteractiveHoverLink>
    );
  }
  return (
    <a className={actionClass(variant, tone, className)} {...props}>
      <Label variant={variant}>{children}</Label>
    </a>
  );
}
