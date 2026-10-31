import { useAuth } from '../auth.tsx';
import { useI18n } from '../i18n/index.tsx';
import { mediaUrl } from '../api.ts';

const PLACEHOLDER_KEYS = ['strength', 'functional', 'pilates', 'yoga', 'running', 'mobility', 'flexibility', 'sea', 'recipe'] as const;
export type CoverKind = (typeof PLACEHOLDER_KEYS)[number];

/** Resolves the image for a workout/practice: its own photo, else the coach's category photo,
 *  else built-in placeholder artwork (flagged so the UI can label it). */
export function useCoverSrc(category?: string | null, mediaId?: string | null): { src: string; placeholder: boolean } {
  const { me } = useAuth();
  if (mediaId) return { src: mediaUrl(mediaId), placeholder: false };
  const coachPhoto = category ? (me as any)?.covers?.[category] : null;
  if (coachPhoto) return { src: mediaUrl(coachPhoto), placeholder: false };
  const key = (PLACEHOLDER_KEYS as readonly string[]).includes(category ?? '') ? category : 'mobility';
  return { src: `/placeholders/${key}.svg`, placeholder: true };
}

/** Image surface. Decorative (alt="") because titles are always rendered as real text nearby. */
export function Cover({ category, mediaId, scrim, className, children, showTag = true }: {
  category?: string | null; mediaId?: string | null; scrim?: boolean; className?: string; children?: React.ReactNode; showTag?: boolean;
}) {
  const { t } = useI18n();
  const { src, placeholder } = useCoverSrc(category, mediaId);
  return (
    <div className={'cover' + (scrim ? ' scrim' : '') + (className ? ' ' + className : '')}>
      <img src={src} alt="" loading="lazy" decoding="async" />
      {placeholder && showTag && <span className="ph-tag">{t('img.placeholder')}</span>}
      {children}
    </div>
  );
}

/** Subtle movement-inspired lines for brand moments (hero, intro, sharing). */
export function FlowLines({ color = '#fff', opacity = 0.3 }: { color?: string; opacity?: number }) {
  return (
    <svg className="flow" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-10 210 C 80 150, 150 260, 240 200 S 360 150, 410 180" fill="none" stroke={color} strokeWidth="2" opacity={opacity} />
      <path d="M-10 240 C 90 190, 170 290, 260 235 S 370 190, 410 215" fill="none" stroke={color} strokeWidth="1.2" opacity={opacity * 0.7} />
    </svg>
  );
}
