/**
 * Client-side image compression and resizing utility.
 * Resizes and compresses images in the browser before upload to prevent
 * oversized payloads and ensure instant uploads.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeBytes?: number;
  quality?: number; // 0.1 to 1.0
  allowedMimeTypes?: string[];
  label?: string;
}

const DEFAULT_OPTIONS: CompressImageOptions = {
  maxWidth: 800,
  maxHeight: 800,
  maxSizeBytes: 300 * 1024, // 300 KB
  quality: 0.85,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  label: 'Image',
};

/**
 * Validates file type and magic bytes (anti-SVG / anti-HTML).
 */
export function validateImageFile(file: File, allowedTypes = DEFAULT_OPTIONS.allowedMimeTypes): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  // Reject SVG to prevent XSS
  if (mime.includes('svg') || name.endsWith('.svg')) {
    return {
      valid: false,
      error: 'SVG images are not allowed. Please upload a PNG, JPEG, or WebP image.',
    };
  }

  const isAllowed = allowedTypes?.some((t) => mime === t || name.endsWith(t.replace('image/', '.')));
  if (!isAllowed) {
    return {
      valid: false,
      error: 'Invalid file format. Please upload a PNG, JPEG, or WebP image.',
    };
  }

  return { valid: true };
}

/**
 * Compresses and resizes an image File or Data URL in the browser using HTML5 Canvas.
 * Returns a base64 Data URL string.
 */
export async function compressImage(
  fileOrDataUrl: File | string,
  options?: CompressImageOptions
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const label = opts.label || 'Image';

  let dataUrl: string;

  if (typeof fileOrDataUrl !== 'string') {
    // Validate format first
    const check = validateImageFile(fileOrDataUrl, opts.allowedMimeTypes);
    if (!check.valid) {
      throw new Error(check.error);
    }

    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(fileOrDataUrl);
    });
  } else {
    dataUrl = fileOrDataUrl;
    if (dataUrl.includes('image/svg') || dataUrl.includes('<svg')) {
      throw new Error('SVG images are not allowed. Please upload a PNG, JPEG, or WebP image.');
    }
  }

  // Load into Image element
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Invalid image file data.'));
    image.src = dataUrl;
  });

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  if (origWidth === 0 || origHeight === 0) {
    throw new Error('Image has zero dimensions.');
  }

  // Calculate new dimensions maintaining aspect ratio
  const maxW = opts.maxWidth || 800;
  const maxH = opts.maxHeight || 800;

  let targetWidth = origWidth;
  let targetHeight = origHeight;

  if (targetWidth > maxW || targetHeight > maxH) {
    const ratio = Math.min(maxW / targetWidth, maxH / targetHeight);
    targetWidth = Math.round(targetWidth * ratio);
    targetHeight = Math.round(targetHeight * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize canvas 2D context.');
  }

  // Enable high-quality image scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Determine output mime: preserve PNG if transparent or specified, otherwise JPEG / WebP
  const isPng = dataUrl.startsWith('data:image/png');
  const outputMime = isPng ? 'image/png' : 'image/jpeg';
  let quality = opts.quality || 0.85;

  let compressedDataUrl = canvas.toDataURL(outputMime, quality);
  let base64Length = compressedDataUrl.length - compressedDataUrl.indexOf(',') - 1;
  let byteSize = Math.floor((base64Length * 3) / 4);

  const maxBytes = opts.maxSizeBytes || 300 * 1024;

  // Progressive quality reduction if over size budget
  if (byteSize > maxBytes && !isPng) {
    while (byteSize > maxBytes && quality > 0.4) {
      quality -= 0.1;
      compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      base64Length = compressedDataUrl.length - compressedDataUrl.indexOf(',') - 1;
      byteSize = Math.floor((base64Length * 3) / 4);
    }
  } else if (byteSize > maxBytes && isPng) {
    // If PNG is too large, convert to JPEG with high quality
    compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    base64Length = compressedDataUrl.length - compressedDataUrl.indexOf(',') - 1;
    byteSize = Math.floor((base64Length * 3) / 4);

    while (byteSize > maxBytes && quality > 0.4) {
      quality -= 0.1;
      compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      base64Length = compressedDataUrl.length - compressedDataUrl.indexOf(',') - 1;
      byteSize = Math.floor((base64Length * 3) / 4);
    }
  }

  if (byteSize > maxBytes) {
    const maxKb = Math.round(maxBytes / 1024);
    throw new Error(`${label} is too large. Maximum size after compression is ${maxKb} KB.`);
  }

  return compressedDataUrl;
}

/**
 * Standard preset for signature and stamp images (max 600px, max 200 KB).
 */
export async function compressSignatoryImage(file: File, label: 'Signature' | 'Stamp'): Promise<string> {
  return compressImage(file, {
    maxWidth: 600,
    maxHeight: 600,
    maxSizeBytes: 200 * 1024, // 200 KB
    quality: 0.85,
    label,
  });
}

/**
 * Standard preset for company logo images (max 800px, max 300 KB).
 */
export async function compressLogoImage(file: File): Promise<string> {
  return compressImage(file, {
    maxWidth: 800,
    maxHeight: 800,
    maxSizeBytes: 300 * 1024, // 300 KB
    quality: 0.9,
    label: 'Company logo',
  });
}

/**
 * Converts a base64 Data URL to a browser File object.
 */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
}
