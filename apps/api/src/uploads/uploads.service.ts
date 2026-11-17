import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export type UploadFolder = 'reviews' | 'receipts' | 'brands' | 'avatars';

const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export interface VerifiedAsset {
  url: string;
  publicId: string;
  deliveryType: 'upload' | 'authenticated';
  format: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private config: ConfigService) {
    const cloudName = this.config.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
    }
  }

  private isConfigured() {
    return !!(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
      this.config.get('CLOUDINARY_API_KEY') &&
      this.config.get('CLOUDINARY_API_SECRET')
    );
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured. Set CLOUDINARY_* env vars.',
      );
    }
  }

  /**
   * Signed direct-upload parameters. The client must POST every key in `params`
   * (plus `file`, `api_key`, `signature`) to `uploadUrl` — Cloudinary rejects the upload
   * if any signed parameter is missing or changed.
   *
   * Receipts are uploaded with type=authenticated: they cannot be fetched by plain URL,
   * only through a signed URL that the API hands to moderators.
   */
  getSignature(folder: UploadFolder) {
    this.assertConfigured();

    const timestamp = Math.round(Date.now() / 1000);
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')!;
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')!;
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')!;
    const uploadFolder = `talkground/${folder}`;

    const params: Record<string, string | number> = {
      timestamp,
      folder: uploadFolder,
      allowed_formats: ALLOWED_FORMATS.join(','),
    };
    if (folder === 'receipts') params.type = 'authenticated';

    const signature = cloudinary.utils.api_sign_request(params, apiSecret);

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: uploadFolder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      params,
      maxBytes: MAX_BYTES,
      allowedFormats: ALLOWED_FORMATS,
    };
  }

  /**
   * Accept only images that live in our Cloudinary account, in the expected folder and
   * delivery type, and (when the Admin API is reachable) exist and are within the size limit.
   */
  async verifyAsset(url: string, folder: UploadFolder): Promise<VerifiedAsset> {
    this.assertConfigured();
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')!;
    const expectedType = folder === 'receipts' ? 'authenticated' : 'upload';

    const pattern = new RegExp(
      `^https://res\\.cloudinary\\.com/${escapeRegex(cloudName)}/image/(upload|authenticated)/` +
        `(?:s--[A-Za-z0-9_-]+--/)?(?:v\\d+/)?` +
        `(talkground/${folder}/[A-Za-z0-9_\\-/]+)\\.(${ALLOWED_FORMATS.join('|')})$`,
      'i',
    );
    const match = pattern.exec(url);
    if (!match || url.includes('..')) {
      throw new BadRequestException(
        `Invalid image URL: upload to talkground/${folder} in TalkGround's Cloudinary account first`,
      );
    }
    const [, deliveryType, publicId, format] = match;
    if (deliveryType !== expectedType) {
      throw new BadRequestException(
        folder === 'receipts'
          ? 'Receipts must be uploaded privately (type=authenticated). Use the params from POST /uploads/signature.'
          : 'Invalid delivery type for this image',
      );
    }

    try {
      const resource = (await cloudinary.api.resource(publicId, {
        type: deliveryType,
        resource_type: 'image',
      })) as { bytes?: number; format?: string };
      if ((resource.bytes ?? 0) > MAX_BYTES) {
        throw new BadRequestException('Image is larger than 5 MB');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const status = (err as { error?: { http_code?: number } })?.error
        ?.http_code;
      if (status === 404) {
        throw new BadRequestException('Image not found in Cloudinary');
      }
      // Admin API quota/outage: the URL already passed strict checks, so don't block the user.
      this.logger.warn(
        `Could not verify Cloudinary asset ${publicId}: ${String(status ?? err)}`,
      );
    }

    return {
      url,
      publicId,
      deliveryType: deliveryType as 'upload' | 'authenticated',
      format: format.toLowerCase(),
    };
  }

  /** Short path for moderators to view a private receipt. Returns the original URL for legacy public uploads. */
  privateViewUrl(storedUrl: string): string {
    if (!this.isConfigured()) return storedUrl;
    const match =
      /\/image\/authenticated\/(?:s--[A-Za-z0-9_-]+--\/)?(?:v\d+\/)?(.+)\.([a-z0-9]+)$/i.exec(
        storedUrl,
      );
    if (!match) return storedUrl;
    return cloudinary.url(match[1], {
      type: 'authenticated',
      sign_url: true,
      secure: true,
      resource_type: 'image',
      format: match[2],
    });
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
