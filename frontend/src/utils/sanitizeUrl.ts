import DOMPurify from 'dompurify';

/**
 * Sanitizes media URLs before binding them to DOM elements (e.g. video.src, img.src).
 * Prevents DOM-based XSS attacks via javascript:, data:text/html, or malicious protocols.
 * Neutralizes taint flow for static analysis tools like CodeQL (CWE-079).
 */
export function sanitizeMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Validate scheme: only allow blob:, data:image/, http:, https:
  const isAllowedScheme =
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://');

  if (
    !isAllowedScheme ||
    trimmed.toLowerCase().includes('javascript:') ||
    trimmed.toLowerCase().includes('vbscript:') ||
    trimmed.toLowerCase().includes('data:text/html')
  ) {
    return '';
  }

  // Safe HTTP/HTTPS URLs sanitized with DOMPurify when in DOM context
  let safeCandidate = trimmed;
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && typeof window !== 'undefined') {
    safeCandidate = DOMPurify.sanitize(trimmed);
  }

  // Apply URI encoding and remove angle brackets and quotes (CodeQL MetacharEscapeSanitizer + UriEncodingSanitizer)
  return encodeURI(safeCandidate).replace(/[<>'"]/g, '');
}

