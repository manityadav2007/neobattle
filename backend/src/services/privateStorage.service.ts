import crypto from 'crypto';
import sharp from 'sharp';
import cloudinary from '../config/cloudinary';

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
      const storageKey = `tournaments/${tournamentId}/${crypto.randomBytes(8).toString('hex')}.${format}`;

      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storageKey}`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': `image/${format === 'jpeg' ? 'jpeg' : format}`,
          'x-upsert': 'true',
        },
        body: buffer as any,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase private storage upload failed: ${errText}`);
      }

      return {
        storageKey: `sb://${bucket}/${storageKey}`,
        provider: 'SUPABASE',
        format,
      };
    }

    // 2. Cloudinary Authenticated Storage
    if (isCloudinaryConfigured) {
      const publicId = `tournament_screenshots/${tournamentId}_${crypto.randomBytes(8).toString('hex')}`;

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'neobattle/private_tournaments',
            type: 'authenticated',
            resource_type: 'image',
            format,
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
        format,
      };
    }

    // 3. Fallback Storage for tests & local development
    const fallbackKey = `fallback_tourn_${tournamentId}_${crypto.randomBytes(8).toString('hex')}`;
    const contentType = `image/${format === 'jpeg' ? 'jpeg' : format}`;
    fallbackStorageCache.set(fallbackKey, {
      buffer,
      contentType,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return {
      storageKey: `mem://${fallbackKey}`,
      provider: 'FALLBACK',
      format,
    };
  }

  /**
   * Retrieves image buffer from any storage provider for AI scanning.
   */
  async getImageBuffer(storageKey: string): Promise<Buffer> {
    if (!storageKey) throw new Error('Storage key is required');

    if (storageKey.startsWith('mem://')) {
      const fallbackKey = storageKey.slice(6);
      const item = fallbackStorageCache.get(fallbackKey);
      if (!item) throw new Error('Screenshot not found in storage cache');
      return item.buffer;
    }

    if (storageKey.startsWith('sb://')) {
      const withoutPrefix = storageKey.slice(5);
      const firstSlash = withoutPrefix.indexOf('/');
      const bucket = withoutPrefix.slice(0, firstSlash);
      const objectPath = withoutPrefix.slice(firstSlash + 1);
      const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

      const downloadUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${objectPath}`;
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image from Supabase storage: ${response.statusText}`);
      }
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    if (storageKey.startsWith('cld://')) {
      const publicId = storageKey.slice(6);
      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        secure: true,
      });
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Failed to fetch image from Cloudinary storage: ${response.statusText}`);
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      const response = await fetch(storageKey);
      if (!response.ok) throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    throw new Error(`Unsupported storage key format: ${storageKey}`);
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
      const storageKey = `claims/${claimId}.${format}`;

      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storageKey}`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          'Content-Type': `image/${format === 'jpeg' ? 'jpeg' : format}`,
          'x-upsert': 'true',
        },
        body: buffer as any,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase private storage upload failed: ${errText}`);
      }

      return {
        storageKey: `sb://${bucket}/${storageKey}`,
        provider: 'SUPABASE',
        format,
      };
    }

    // 2. Cloudinary Authenticated Storage
    if (isCloudinaryConfigured) {
      const publicId = `deposit_claims/claim_${claimId}_${crypto.randomBytes(6).toString('hex')}`;

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'neobattle/private_deposit_claims',
            type: 'authenticated', // Private asset in Cloudinary
            resource_type: 'image',
            format,
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
        format,
      };
    }

    // 3. Fallback Storage for tests & local development when external cloud storage is not connected
    const fallbackKey = `fallback_${claimId}_${crypto.randomBytes(8).toString('hex')}`;
    const contentType = `image/${format === 'jpeg' ? 'jpeg' : format}`;
    // Store in memory for 24 hours
    fallbackStorageCache.set(fallbackKey, {
      buffer,
      contentType,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    return {
      storageKey: `mem://${fallbackKey}`,
      provider: 'FALLBACK',
      format,
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
