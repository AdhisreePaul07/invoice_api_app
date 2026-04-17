import { ImageAsset } from '../models/image.model';
import { environment } from '../../../environments/environment';

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);

export function validateImageFile(file: File | null | undefined): string | null {
  if (!file) {
    return 'Please choose an image file to upload.';
  }

  if (file.size <= 0) {
    return 'The selected image is empty.';
  }

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return 'Image size must be 5MB or less.';
  }

  const extension = String(file.name || '')
    .trim()
    .split('.')
    .pop()
    ?.toLowerCase();
  const normalizedExtension = extension === 'jpg' ? 'jpeg' : extension;
  const normalizedType = String(file.type || '').trim().toLowerCase();

  if (normalizedExtension && !ALLOWED_IMAGE_EXTENSIONS.has(normalizedExtension)) {
    return 'Unsupported image type. Allowed types: PNG, JPG, JPEG, WEBP, SVG.';
  }

  if (normalizedType && !ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    return 'Unsupported image type. Allowed types: PNG, JPG, JPEG, WEBP, SVG.';
  }

  if (!normalizedExtension && !normalizedType) {
    return 'Unable to verify the selected file type.';
  }

  return null;
}

export function formatImageAssetMeta(asset: ImageAsset | null | undefined): string {
  if (!asset) {
    return '';
  }

  const parts = [formatFileSize(asset.size), normalizeFileExtension(asset.extension)];
  return parts.filter(Boolean).join(' • ');
}

export function formatFileSize(value: number | null | undefined): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function imageUrl(asset: ImageAsset | null | undefined): string {
  return resolveImageUrl(String(asset?.url || '').trim());
}

export function resolveImageUrl(value: string | null | undefined): string {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) {
    return '';
  }

  if (/^(https?:|data:|blob:)/i.test(rawUrl)) {
    return rawUrl;
  }

  try {
    return new URL(rawUrl, environment.apiBaseUrl).toString();
  } catch {
    return rawUrl;
  }
}

function normalizeFileExtension(value: string | null | undefined): string {
  const extension = String(value || '').trim().toUpperCase();
  return extension || '';
}
