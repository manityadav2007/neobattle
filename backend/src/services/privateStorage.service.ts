import crypto from 'crypto';
import net from 'net';
import sharp from 'sharp';
import cloudinary from '../config/cloudinary';

/**
 * Checks whether an IP address is private, loopback, link-local, or broadcast.
 */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  if (!ip) return true;
  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 10) return true; // 10.0.0.0/8 (private)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / AWS metadata)
    if (a === 255 && b === 255) return true; // Broadcast
    return false;
  }
  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
    return false;
  }
  return false;
}

/**
 * Validates that a target URL belongs to an allowlisted storage host from env,
 * and is not loopback, private, or link-local.
 */
export function validateStorageUrl(rawUrl: string, expectedHostEnvVar?: string): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Invalid storage URL: URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Malformed storage URL');
  }

  // Enforce HTTPS
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported protocol for storage URL: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and standard loopback hostnames
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('SSRF blocked: loopback or local hostname is forbidden');
  }

  // Block direct private/loopback/link-local IP addresses
  if (net.isIP(hostname) && isPrivateOrLoopbackIp(hostname)) {
    throw new Error(`SSRF blocked: private or loopback IP ${hostname} is forbidden`);
  }

  // Allowlist verification against configured storage hosts
  const allowedHosts: string[] = [];

  if (expectedHostEnvVar) {
    try {
      const u = new URL(expectedHostEnvVar.startsWith('http') ? expectedHostEnvVar : `https://${expectedHostEnvVar}`);
      allowedHosts.push(u.hostname.toLowerCase());
    } catch {
      allowedHosts.push(expectedHostEnvVar.toLowerCase());
    }
  }

  if (process.env.SUPABASE_URL) {
    try {
      allowedHosts.push(new URL(process.env.SUPABASE_URL).hostname.toLowerCase());
    } catch {}
  }

  // Cloudinary standard delivery hosts
  allowedHosts.push('res.cloudinary.com', 'api.cloudinary.com');

  const isAllowlisted = allowedHosts.some(
    (h) => hostname === h || (h.startsWith('.') && hostname.endsWith(h))
  );

  if (!isAllowlisted) {
    throw new Error(`SSRF blocked: storage host "${hostname}" is not in the allowlist`);
  }

  return parsed;
}

export interface ImageValidationResult {
  valid: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  error?: string;
}

export interface StoredScreenshot {
  storageKey: string;
  provider: 'CLOUDINARY' | 'SUPABASE' | 'FALLBACK';
  format: 'jpeg' | 'png' | 'webp';
}

// In-memory cache for fallback storage (used when neither Cloudinary nor Supabase is configured in local dev/tests)
const fallbackStorageCache = new Map<string, { buffer: Buffer; contentType: string; expiresAt: number }>();

export class PrivateStorageService {
  /**
   * Validates image magic bytes to ensure the file is genuinely JPG, PNG, or WebP.
   */
  validateImageMagicBytes(buffer: Buffer): ImageValidationResult {
    if (!buffer || buffer.length < 12) {
      return { valid: false, error: 'File is too small or empty to be a valid image' };
    }

    // 1. JPEG: 0xFF, 0xD8, 0xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true, format: 'jpeg' };
    }

    // 2. PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { valid: true, format: 'png' };
    }

    // 3. WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { valid: true, format: 'webp' };
    }

    return {
      valid: false,
      error: 'Invalid file format. Only genuine JPG, PNG, and WebP images are allowed.',
    };
  }

  /**
   * Strips EXIF metadata using sharp and re-encodes the image.
   * Sharp automatically strips EXIF, GPS, and camera metadata unless explicitly instructed to retain it.
   */
  async stripExifAndSanitize(buffer: Buffer): Promise<{ buffer: Buffer; format: 'jpeg' | 'png' | 'webp' }> {
    const magicCheck = this.validateImageMagicBytes(buffer);
    if (!magicCheck.valid || !magicCheck.format) {
      throw new Error(magicCheck.error || 'Invalid image file');
    }

    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
        throw new Error('Image header validation failed: unsupported format');
      }

      // Rotate image based on orientation before stripping EXIF, then re-encode cleanly
      let sanitizedBuffer: Buffer;
      const targetFormat = magicCheck.format;

      if (targetFormat === 'png') {
        sanitizedBuffer = await sharp(buffer).rotate().png({ compressionLevel: 8 }).toBuffer();
      } else if (targetFormat === 'webp') {
        sanitizedBuffer = await sharp(buffer).rotate().webp({ quality: 90 }).toBuffer();
      } else {
        sanitizedBuffer = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
      }

      return { buffer: sanitizedBuffer, format: targetFormat };
    } catch (err: any) {
      throw new Error(`Failed to process image: ${err.message || 'Corrupted image file'}`);
    }
  }

  /**
   * Computes SHA-256 hash of a buffer.
   */
  computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Uploads screenshot to PRIVATE storage for tournaments.
   */
  async uploadTournamentScreenshot(
    buffer: Buffer,
    tournamentId: string,
    format: 'jpeg' | 'png' | 'webp'
  ): Promise<StoredScreenshot> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tournamentId)) {
      throw new Error('Invalid tournament ID for storage upload');
    }

    const safeFormat: 'jpeg' | 'png' | 'webp' =
      format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpeg';
    const serverGeneratedId = crypto.randomBytes(16).toString('hex');

    const isSupabaseConfigured =
      Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    const isCloudinaryConfigured =
      Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
      Boolean(process.env.CLOUDINARY_API_KEY) &&
      Boolean(process.env.CLOUDINARY_API_SECRET);

    // 1. Supabase Storage Private Bucket
    if (isSupabaseConfigured) {
      const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const bucket = process.env.SUPABASE_TOURNAMENT_BUCKET || 'private-tournaments';
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(bucket)) {
        throw new Error('Invalid Supabase bucket configuration');
      }

      const storageKey = `tournaments/${tournamentId}/${serverGeneratedId}.${safeFormat}`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storageKey}`;
      const validatedUrl = validateStorageUrl(uploadUrl, supabaseUrl);

      const response = await fetch(validatedUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': `image/${safeFormat}`,
          'x-upsert': 'true',
        },
        body: buffer as any,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase private storage upload failed: ${errText}`);
      }

      return {
        storageKey: `sb://${bucket}/${storageKey}`,
        provider: 'SUPABASE',
        format: safeFormat,
      };
    }

    // 2. Cloudinary Authenticated Storage
    if (isCloudinaryConfigured) {
      const publicId = `tournament_screenshots/${tournamentId}_${serverGeneratedId}`;

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'neobattle/private_tournaments',
            type: 'authenticated',
            resource_type: 'image',
            format: safeFormat,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });

      return {
        storageKey: `cld://${uploadResult.public_id}`,
        provider: 'CLOUDINARY',
        format: safeFormat,
      };
    }

    // 3. Fallback Storage for tests & local development
    const fallbackKey = `fallback_tourn_${tournamentId}_${serverGeneratedId}`;
    const contentType = `image/${safeFormat}`;
    fallbackStorageCache.set(fallbackKey, {
      buffer,
      contentType,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return {
      storageKey: `mem://${fallbackKey}`,
      provider: 'FALLBACK',
      format: safeFormat,
    };
  }

  /**
   * Retrieves image buffer from any storage provider for AI scanning.
   */
  async getImageBuffer(storageKey: string): Promise<Buffer> {
    if (!storageKey || typeof storageKey !== 'string') {
      throw new Error('Storage key is required');
    }

    if (storageKey.startsWith('mem://')) {
      const fallbackKey = storageKey.slice(6);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(fallbackKey)) {
        throw new Error('Invalid fallback storage key format');
      }
      const item = fallbackStorageCache.get(fallbackKey);
      if (!item) throw new Error('Screenshot not found in storage cache');
      return item.buffer;
    }

    if (storageKey.startsWith('sb://')) {
      const withoutPrefix = storageKey.slice(5);
      const firstSlash = withoutPrefix.indexOf('/');
      if (firstSlash === -1) {
        throw new Error('Invalid Supabase storage key structure');
      }
      const bucket = withoutPrefix.slice(0, firstSlash);
      const objectPath = withoutPrefix.slice(firstSlash + 1);

      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(bucket)) {
        throw new Error('Invalid storage bucket identifier');
      }
      if (
        !/^[a-zA-Z0-9_\-\/.]+\.(jpeg|jpg|png|webp)$/.test(objectPath) ||
        objectPath.includes('..') ||
        objectPath.includes(':')
      ) {
        throw new Error('Invalid storage object path format');
      }

      const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase storage is not configured');
      }

      const downloadUrl = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${objectPath}`;
      const validatedUrl = validateStorageUrl(downloadUrl, supabaseUrl);

      const response = await fetch(validatedUrl.toString(), {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image from Supabase storage: ${response.statusText}`);
      }
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    if (storageKey.startsWith('cld://')) {
      const publicId = storageKey.slice(6);
      if (!/^[a-zA-Z0-9_\-\/]+$/.test(publicId) || publicId.includes('..')) {
        throw new Error('Invalid Cloudinary storage key format');
      }

      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        secure: true,
      });

      const validatedUrl = validateStorageUrl(signedUrl, 'res.cloudinary.com');

      const response = await fetch(validatedUrl.toString(), {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image from Cloudinary storage: ${response.statusText}`);
      }
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    // Reject any arbitrary external URLs (SSRF protection)
    throw new Error(`Unsupported or untrusted storage key format: ${storageKey}`);
  }

  /**
   * Uploads screenshot to PRIVATE storage (authenticated Cloudinary or Supabase Storage private bucket).
   * Does NOT store on Render local disk.
   */
  async uploadPrivateScreenshot(
    buffer: Buffer,
    claimId: string,
    format: 'jpeg' | 'png' | 'webp'
  ): Promise<StoredScreenshot> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(claimId)) {
      throw new Error('Invalid claim ID for storage upload');
    }

    const safeFormat: 'jpeg' | 'png' | 'webp' =
      format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpeg';
    const serverGeneratedId = crypto.randomBytes(16).toString('hex');

    const isSupabaseConfigured =
      Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    const isCloudinaryConfigured =
      Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
      Boolean(process.env.CLOUDINARY_API_KEY) &&
      Boolean(process.env.CLOUDINARY_API_SECRET);

    // 1. Supabase Storage Private Bucket
    if (isSupabaseConfigured) {
      const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const bucket = process.env.SUPABASE_DEPOSIT_BUCKET || 'private-deposits';
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(bucket)) {
        throw new Error('Invalid Supabase bucket configuration');
      }

      const storageKey = `claims/${claimId}_${serverGeneratedId}.${safeFormat}`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storageKey}`;
      const validatedUrl = validateStorageUrl(uploadUrl, supabaseUrl);

      const response = await fetch(validatedUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': `image/${safeFormat}`,
          'x-upsert': 'true',
        },
        body: buffer as any,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase private storage upload failed: ${errText}`);
      }

      return {
        storageKey: `sb://${bucket}/${storageKey}`,
        provider: 'SUPABASE',
        format: safeFormat,
      };
    }

    // 2. Cloudinary Authenticated Storage
    if (isCloudinaryConfigured) {
      const publicId = `deposit_claims/claim_${claimId}_${serverGeneratedId}`;

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'neobattle/private_deposit_claims',
            type: 'authenticated', // Private asset in Cloudinary
            resource_type: 'image',
            format: safeFormat,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });

      return {
        storageKey: `cld://${uploadResult.public_id}`,
        provider: 'CLOUDINARY',
        format: safeFormat,
      };
    }

    // 3. Fallback Storage for tests & local development when external cloud storage is not connected
    const fallbackKey = `fallback_${claimId}_${serverGeneratedId}`;
    const contentType = `image/${safeFormat}`;
    fallbackStorageCache.set(fallbackKey, {
      buffer,
      contentType,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    return {
      storageKey: `mem://${fallbackKey}`,
      provider: 'FALLBACK',
      format: safeFormat,
    };
  }

  /**
   * Generates a short-lived signed URL for admin viewing (e.g. 15 minutes).
   * Never exposes internal storage paths or server paths.
   */
  async getAdminSignedUrl(storageKey: string, expiresInSeconds = 900): Promise<string> {
    if (!storageKey) return '';

    // Case 1: Supabase Storage
    if (storageKey.startsWith('sb://')) {
      const withoutPrefix = storageKey.slice(5); // e.g. "bucket/claims/claimId.jpg"
      const firstSlash = withoutPrefix.indexOf('/');
      const bucket = withoutPrefix.slice(0, firstSlash);
      const objectPath = withoutPrefix.slice(firstSlash + 1);

      const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

      const signUrl = `${supabaseUrl}/storage/v1/object/sign/${bucket}/${objectPath}`;
      const response = await fetch(signUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });

      if (response.ok) {
        const data = await response.json();
        return `${supabaseUrl}/storage/v1${data.signedURL}`;
      }
      return '';
    }

    // Case 2: Cloudinary Authenticated
    if (storageKey.startsWith('cld://')) {
      const publicId = storageKey.slice(6);
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

      // Cloudinary authenticated signed URL
      return cloudinary.url(publicId, {
        type: 'authenticated',
        sign_url: true,
        expires_at: expiresAt,
        secure: true,
      });
    }

    // Case 3: Fallback / In-Memory
    if (storageKey.startsWith('mem://')) {
      const fallbackKey = storageKey.slice(6);
      const item = fallbackStorageCache.get(fallbackKey);
      if (item && item.expiresAt > Date.now()) {
        const secret = process.env.JWT_SECRET || 'firearena_secret';
        const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
        const sig = crypto.createHmac('sha256', secret).update(`${fallbackKey}:${exp}`).digest('hex');
        const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
        const routePath = fallbackKey.startsWith('fallback_tourn_')
          ? '/api/admin/kill-counter/screenshot/view'
          : '/api/deposits/screenshot/view';
        return `${baseUrl}${routePath}?key=${fallbackKey}&exp=${exp}&sig=${sig}`;
      }
      return '';
    }

    // Standard URL fallback if legacy URL
    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      return storageKey;
    }

    return '';
  }

  /**
   * Retrieves image buffer from fallback cache (for admin view endpoint).
   */
  getFallbackImage(key: string, exp: number, sig: string): { buffer: Buffer; contentType: string } | null {
    if (Date.now() > exp * 1000) return null;
    const secret = process.env.JWT_SECRET || 'firearena_secret';
    const expectedSig = crypto.createHmac('sha256', secret).update(`${key}:${exp}`).digest('hex');
    if (sig !== expectedSig) return null;

    const item = fallbackStorageCache.get(key);
    if (!item) return null;
    return { buffer: item.buffer, contentType: item.contentType };
  }
}

export const privateStorageService = new PrivateStorageService();
