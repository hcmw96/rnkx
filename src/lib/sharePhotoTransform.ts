import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '@/lib/shareCardImage';

export type SharePhotoTransform = {
  /** Multiplier on cover-fit (≥ 1). */
  scale: number;
  /** Translation in card pixels (origin at frame centre). */
  x: number;
  y: number;
};

export const DEFAULT_SHARE_PHOTO_TRANSFORM: SharePhotoTransform = {
  scale: 1,
  x: 0,
  y: 0,
};

export const SHARE_PHOTO_MIN_SCALE = 1;
export const SHARE_PHOTO_MAX_SCALE = 4;

/** Cover-fit scale so the image always fills the 1080×1920 frame at transform.scale = 1. */
export function coverFitScale(imageWidth: number, imageHeight: number): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1;
  return Math.max(SHARE_CARD_WIDTH / imageWidth, SHARE_CARD_HEIGHT / imageHeight);
}

export function clampSharePhotoTransform(
  transform: SharePhotoTransform,
  imageWidth: number,
  imageHeight: number,
): SharePhotoTransform {
  const scale = Math.min(
    SHARE_PHOTO_MAX_SCALE,
    Math.max(SHARE_PHOTO_MIN_SCALE, transform.scale),
  );
  const base = coverFitScale(imageWidth, imageHeight);
  const renderedW = imageWidth * base * scale;
  const renderedH = imageHeight * base * scale;

  const maxX = Math.max(0, (renderedW - SHARE_CARD_WIDTH) / 2);
  const maxY = Math.max(0, (renderedH - SHARE_CARD_HEIGHT) / 2);

  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  };
}
