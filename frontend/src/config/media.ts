/**
 * Homepage hero media. Leave both unset to show the illustrated fallback.
 * Set VITE_HERO_VIDEO_SRC (and ideally VITE_HERO_POSTER_SRC) in frontend/.env.local, or put files in public/.
 * The poster is shown while the video loads, when it fails, and to visitors who prefer reduced motion.
 */
export const HERO_MEDIA = {
  videoSrc: (import.meta.env.VITE_HERO_VIDEO_SRC as string | undefined) || '/media/bayvideo.mp4',
  posterSrc: (import.meta.env.VITE_HERO_POSTER_SRC as string | undefined) || '/media/Outdoor_Hard_Tennis_Court.png',
};
