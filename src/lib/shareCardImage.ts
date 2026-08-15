import html2canvas from 'html2canvas';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

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

function coverDraw(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  dw: number,
  dh: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, dw, dh);
  const scale = Math.max(dw / source.width, dh / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (dw - w) / 2, (dh - h) / 2, w, h);
}

/** Ensure export is exactly 1080×1920; cover-crop and log if html2canvas drifts. */
function assertShareCardDimensions(source: HTMLCanvasElement): HTMLCanvasElement {
  if (source.width === SHARE_CARD_WIDTH && source.height === SHARE_CARD_HEIGHT) {
    return source;
  }

  console.warn('[shareCardImage] html2canvas size mismatch — correcting', {
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
  coverDraw(ctx, source, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
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
  el.style.width = `${SHARE_CARD_WIDTH}px`;
  el.style.height = `${SHARE_CARD_HEIGHT}px`;
  el.style.minWidth = `${SHARE_CARD_WIDTH}px`;
  el.style.minHeight = `${SHARE_CARD_HEIGHT}px`;
  el.style.maxWidth = `${SHARE_CARD_WIDTH}px`;
  el.style.maxHeight = `${SHARE_CARD_HEIGHT}px`;
  el.style.overflow = 'hidden';
  el.style.backgroundColor = '#000000';
  el.style.opacity = '1';
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }),
  );
}

export async function captureElementAsPng(element: HTMLElement): Promise<Blob> {
  forceCaptureBox(element);
  await waitForImages(element);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;

  const rendered = await html2canvas(element, {
    canvas,
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    windowWidth: SHARE_CARD_WIDTH,
    windowHeight: SHARE_CARD_HEIGHT,
    scrollX: 0,
    scrollY: 0,
    scale: 1,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#000000',
    logging: false,
    onclone: (_doc, cloned) => {
      forceCaptureBox(cloned);
      const frame = cloned.querySelector(':scope > *') as HTMLElement | null;
      if (frame) forceCaptureBox(frame);
    },
  });

  const sized = assertShareCardDimensions(rendered);
  const blob = await canvasToPngBlob(sized);
  await logBlobDimensions(blob);
  return blob;
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
