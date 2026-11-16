/**
 * Media thumbnail (Phase 10C).
 *
 * Renders the generated `thumbnail`/`small` derivative when the server produced
 * one, otherwise the original image. Documents show their format label because
 * a PDF has no raster preview. Alt text comes from the asset's editorial `alt`;
 * an empty value keeps the image decorative rather than inventing a filename.
 */
import type { MediaDto } from '@shared/media';
import { mediaPreviewUrl, mimeTypeLabel } from '../../lib/media';

interface MediaThumbnailProps {
  media: MediaDto;
  size?: 'small' | 'card';
}

export function MediaThumbnail({ media, size = 'card' }: MediaThumbnailProps) {
  const url = mediaPreviewUrl(media);

  return (
    <span className={`media-thumb media-thumb--${size}`}>
      {url ? (
        <img
          src={url}
          alt={media.alt ?? ''}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="media-thumb__filetype" aria-hidden="true">
          {mimeTypeLabel(media.mimeType)}
        </span>
      )}
    </span>
  );
}
