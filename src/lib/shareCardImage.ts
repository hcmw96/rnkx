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

/** Ensure export is exactly 1080×1920; rescale and log if html2canvas drifts. */
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
  ctx.drawImage(source, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  return corrected;
}

export async function captureElementAsPng(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    scale: 1,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });

  const sized = assertShareCardDimensions(canvas);
  return canvasToPngBlob(sized);
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
