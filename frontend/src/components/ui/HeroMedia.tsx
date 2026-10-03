import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  videoSrc?: string | null;
  posterSrc?: string | null;
  /** Rendered when there is no video and no poster (or the poster fails). */
  fallback: ReactNode;
  className?: string;
}

/** Background media slot: muted looping video → poster image → illustrated fallback. */
export function HeroMedia({ videoSrc, posterSrc, fallback, className }: Props) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  const showVideo = !!videoSrc && !videoFailed && !reduced;
  const showPoster = !showVideo && !!posterSrc && !posterFailed;

  return (
    <div className={cn('overflow-hidden', className)} aria-hidden="true">
      {showVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc!}
          poster={posterSrc ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
        />
      ) : showPoster ? (
        <img className="absolute inset-0 h-full w-full object-cover" src={posterSrc!} alt="" onError={() => setPosterFailed(true)} />
      ) : (
        fallback
      )}
    </div>
  );
}
