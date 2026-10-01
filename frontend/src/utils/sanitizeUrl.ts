import DOMPurify from 'dompurify';

/**
 * Sanitizes media URLs before binding them to DOM elements (e.g. video.src, img.src).
 * Prevents DOM-based XSS attacks via javascript:, data:text/html, or malicious protocols.
 */
export function sanitizeMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Safe blob URLs created via URL.createObjectURL
  if (trimmed.startsWith('blob:')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'blob:') {
        return trimmed;
      }
    } catch {
      return '';
    }
  }

  // Safe inline image data URIs
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Safe HTTP/HTTPS URLs
  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (typeof window !== 'undefined') {
        return DOMPurify.sanitize(trimmed);
      }
      return trimmed;
    }
  } catch {
    return '';
  }

  return '';
}
