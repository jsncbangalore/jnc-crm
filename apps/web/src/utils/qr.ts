import QRCode from 'qrcode';

export interface DrawQrOptions {
  size?: number;
  margin?: number;
  colorDark?: string;
  colorLight?: string;
}

/**
 * Standard QR Code renderer using battle-tested qrcode@1.5.4 library.
 * Pure in-browser rendering on HTML5 canvas with zero network calls.
 */
export function drawQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options?: DrawQrOptions,
): Promise<void> {
  const size = options?.size ?? 240;
  const margin = options?.margin ?? 2;
  const colorDark = options?.colorDark ?? '#000000';
  const colorLight = options?.colorLight ?? '#ffffff';

  return QRCode.toCanvas(canvas, text, {
    width: size,
    margin,
    color: {
      dark: colorDark,
      light: colorLight,
    },
    errorCorrectionLevel: 'M',
  });
}
