import html2canvas from 'html2canvas';
import rnkxLogo from '@/assets/rnkx-logo.svg';
import rnkxSymbol from '@/assets/rnkx-symbol.png';
import { useEffect, useState } from 'react';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

/** CSS scale applied to the 1080×1920 layout in the in-app preview. */
export const SHARE_CARD_PREVIEW_SCALE = 0.28;

/** Equal-width stat cells; the block is centred on the 1080 canvas. */
export const SHARE_CARD_STAT_CELL_WIDTH = 300;
export const SHARE_CARD_STAT_RULE_WIDTH = 2;
export const SHARE_CARD_STAT_COLUMNS = 3;
export const SHARE_CARD_STAT_BLOCK_WIDTH =
  SHARE_CARD_STAT_CELL_WIDTH * SHARE_CARD_STAT_COLUMNS +
  SHARE_CARD_STAT_RULE_WIDTH * (SHARE_CARD_STAT_COLUMNS - 1);
/** Left edge of the 3-cell block. Right margin equals this (88px). */
export const SHARE_CARD_STAT_BLOCK_LEFT =
  (SHARE_CARD_WIDTH - SHARE_CARD_STAT_BLOCK_WIDTH) / 2;

const SHARE_CARD_IMAGE_URLS = [rnkxLogo, rnkxSymbol];

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

let shareCardImagesReady: Promise<void> | null = null;

/** Decode wordmark + symbol before preview/capture so the logo is never missing. */
export function ensureShareCardImagesLoaded(): Promise<void> {
  if (!shareCardImagesReady) {
    shareCardImagesReady = Promise.all(SHARE_CARD_IMAGE_URLS.map(loadImage)).then(() => undefined);
  }
  return shareCardImagesReady;
}

void ensureShareCardImagesLoaded();

export function useShareCardImagesReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void ensureShareCardImagesLoaded().then(() => setReady(true));
  }, []);
  return ready;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not create image'));
        else resolve(blob);
      },
      'image/png',
      1,
    );
  });
}

/**
 * Map html2canvas output onto 1080×1920 from the top-left origin.
 * Never cover-crop from the centre — that shifts the stat block.
 */
function pinToShareCardSize(source: HTMLCanvasElement): HTMLCanvasElement {
  if (source.width === SHARE_CARD_WIDTH && source.height === SHARE_CARD_HEIGHT) {
    return source;
  }

  console.warn('[shareCardImage] html2canvas size mismatch — pinning top-left', {
    got: { width: source.width, height: source.height },
    expected: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  });

  const corrected = document.createElement('canvas');
  corrected.width = SHARE_CARD_WIDTH;
  corrected.height = SHARE_CARD_HEIGHT;
  const ctx = corrected.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create correction canvas');
  }
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  const scaleX = SHARE_CARD_WIDTH / source.width;
  const scaleY = SHARE_CARD_HEIGHT / source.height;
  if (Math.abs(scaleX - scaleY) < 0.002) {
    ctx.drawImage(source, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  } else {
    ctx.drawImage(source, 0, 0);
  }
  return corrected;
}

async function logBlobDimensions(blob: Blob): Promise<void> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      console.log('[shareCardImage] export blob', {
        width: bitmap.width,
        height: bitmap.height,
        bytes: blob.size,
      });
      bitmap.close();
      return;
    }
  } catch {
    // fall through to Image decode
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode share image'));
      img.src = url;
    });
    console.log('[shareCardImage] export blob', {
      width: img.naturalWidth,
      height: img.naturalHeight,
      bytes: blob.size,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function forceCaptureBox(el: HTMLElement): void {
  el.style.position = 'relative';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.margin = '0px';
  el.style.transform = 'none';
  el.style.zoom = '1';
  el.style.width = `${SHARE_CARD_WIDTH}px`;
  el.style.height = `${SHARE_CARD_HEIGHT}px`;
  el.style.minWidth = `${SHARE_CARD_WIDTH}px`;
  el.style.minHeight = `${SHARE_CARD_HEIGHT}px`;
  el.style.maxWidth = `${SHARE_CARD_WIDTH}px`;
  el.style.maxHeight = `${SHARE_CARD_HEIGHT}px`;
  el.style.overflow = 'hidden';
  el.style.backgroundColor = '#000000';
  el.style.opacity = '1';
  el.style.boxSizing = 'border-box';
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          // ignore decode failures — capture still proceeds
        }
      }
    }),
  );
}

export async function captureElementAsPng(element: HTMLElement): Promise<Blob> {
  const previousStyle = element.getAttribute('style');
  forceCaptureBox(element);
  try {
    await ensureShareCardImagesLoaded();
    await waitForImages(element);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const rendered = await html2canvas(element, {
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
      windowWidth: SHARE_CARD_WIDTH,
      windowHeight: SHARE_CARD_HEIGHT,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#000000',
      logging: false,
      onclone: (clonedDoc, cloned) => {
        clonedDoc.documentElement.style.margin = '0';
        clonedDoc.documentElement.style.padding = '0';
        clonedDoc.body.style.margin = '0';
        clonedDoc.body.style.padding = '0';
        clonedDoc.body.style.overflow = 'hidden';
        forceCaptureBox(cloned);
        cloned.style.position = 'absolute';
        const frame = cloned.querySelector(':scope > *') as HTMLElement | null;
        if (frame) {
          forceCaptureBox(frame);
          frame.style.position = 'relative';
        }
      },
    });

    const sized = pinToShareCardSize(rendered);
    const blob = await canvasToPngBlob(sized);
    await logBlobDimensions(blob);
    return blob;
  } finally {
    if (previousStyle == null) element.removeAttribute('style');
    else element.setAttribute('style', previousStyle);
  }
}

export async function sharePngBlob(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text: 'Shared from RNKX' });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}
