import { useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { mediaUrl, uploadFile, POST } from '../api.ts';
import { Modal, errorText, Icon } from './ui.tsx';
import { formatDuration } from '../../../shared/pace.ts';

export interface MediaRef {
  id: string;
  title: string;
  kind?: string;
  duration_sec?: number | null;
  external_url?: string | null;
  mime?: string | null;
  status?: string;
  equipment?: string | null;
  level?: string | null;
  instructions?: string | null;
  purpose?: string | null;
}

/** Turns supported external links into embeddable URLs; anything else opens in a new tab. */
function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed${u.pathname}`;
    if (u.hostname.includes('vimeo.com') && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
  } catch { /* invalid url */ }
  return null;
}

export function MediaPlayer({ media }: { media: MediaRef }) {
  if (media.external_url) {
    const e = embedUrl(media.external_url);
    return e ? (
      <div className="video-wrap"><iframe src={e} title={media.title} allow="fullscreen; picture-in-picture" allowFullScreen /></div>
    ) : (
      <a className="btn" href={media.external_url} target="_blank" rel="noreferrer noopener">{media.title} ↗</a>
    );
  }
  if (media.mime?.startsWith('image/')) return <img src={mediaUrl(media.id)} alt={media.title} style={{ borderRadius: 12 }} />;
  return (
    <div className="video-wrap">
      <video src={mediaUrl(media.id)} controls playsInline preload="metadata" />
    </div>
  );
}

/** A compact button that opens a demonstration or follow-along video in a sheet. */
export function VideoButton({ media, label }: { media: MediaRef | null | undefined; label: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  if (!media) return null;
  return (
    <>
      <button className="btn small" onClick={() => setOpen(true)}>
        <Icon name="play" /> {label}
        {media.duration_sec ? <span className="num tiny muted">{formatDuration(media.duration_sec)}</span> : null}
      </button>
      {open && (
        <Modal title={media.title} onClose={() => setOpen(false)}>
          <MediaPlayer media={media} />
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            {media.purpose && <p><strong>{t('training.purpose')}:</strong> {media.purpose}</p>}
            <div className="row small muted">
              {media.level && <span>{t('lib.level')}: {media.level}</span>}
              {media.equipment && <span>{t('lib.equipment')}: {media.equipment}</span>}
            </div>
            {media.instructions && <p className="pre">{media.instructions}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Creates a media record and uploads the file with progress. Handles failed and interrupted
 * uploads: the record stays and the same file can be retried.
 */
export function Uploader({
  createPath, meta, accept = 'video/*,image/*', label, onDone,
}: { createPath: string; meta: Record<string, unknown>; accept?: string; label: string; onDone: (mediaId: string) => void }) {
  const { t } = useI18n();
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [pending, setPending] = useState<{ id: string; file: File } | null>(null);

  const send = async (id: string, file: File) => {
    setErr(null);
    setPct(0);
    try {
      await uploadFile(id, file, setPct);
      setPct(null);
      setPending(null);
      onDone(id);
    } catch (e) {
      setPct(null);
      setErr(e);
      setPending({ id, file });
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { id } = await POST<{ id: string }>(createPath, { ...meta, title: (meta.title as string) || file.name });
      await send(id, file);
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <div className="stack">
      <label className="btn small" style={{ cursor: 'pointer' }}>
        <Icon name="video" /> {label}
        <input type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} disabled={pct != null} />
      </label>
      {pct != null && (
        <div>
          <div className="tiny muted">{t('lib.uploading', { pct })}</div>
          <div className="macro"><div style={{ width: pct + '%' }} /></div>
        </div>
      )}
      {!!err && (
        <div className="alert error row between">
          <span>{errorText(t, err)}</span>
          {pending && <button className="btn small" onClick={() => send(pending.id, pending.file)}>{t('common.retry')}</button>}
        </div>
      )}
    </div>
  );
}
