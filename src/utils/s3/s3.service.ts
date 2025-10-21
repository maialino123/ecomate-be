import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnvService } from '@env/env.service';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client?: S3Client;
  private bucket?: string;
  private publicUrl?: string;
  private isConfigured: boolean = false;

  constructor(private envService: EnvService) {
    try {
      const s3Config = this.envService.getS3Config();

      // Check if S3 is configured
      if (!s3Config.endpoint || !s3Config.credentials?.accessKeyId || !s3Config.credentials?.secretAccessKey || !s3Config.bucket) {
        this.logger.warn('⚠️  S3/R2 not configured - file upload features will be disabled');
        return;
      }

      this.client = new S3Client({
        endpoint: s3Config.endpoint,
        region: s3Config.region,
        credentials: s3Config.credentials as any,
      });

      this.bucket = s3Config.bucket;
      this.publicUrl = s3Config.publicUrl;
      this.isConfigured = true;
      this.logger.log('✅ S3/R2 configured successfully');
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize S3/R2: ${error?.message || 'Unknown error'}`);
    }
  }

  private ensureConfigured() {
    if (!this.isConfigured || !this.client || !this.bucket) {
      throw new Error('S3/R2 is not configured. Please set S3 environment variables.');
    }
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    this.ensureConfigured();

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket!,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      });

      await this.client!.send(command);
      this.logger.log(`File uploaded: ${key}`);

      return this.getPublicUrl(key);
    } catch (error) {
      this.logger.error(`Failed to upload file: ${key}`, error);
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket!,
        Key: key,
      });

      const response = await this.client!.send(command);
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        const stream = response.Body as any;
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to download file: ${key}`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket!,
        Key: key,
      });

      await this.client!.send(command);
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${key}`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket!,
        Key: key,
      });

      await this.client!.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async list(prefix?: string, maxKeys = 1000): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket!,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client!.send(command);
      return response.Contents?.map((obj) => obj.Key!).filter(Boolean) || [];
    } catch (error) {
      this.logger.error(`Failed to list objects: ${prefix}`, error);
      throw error;
    }
  }

  async getSignedUrl(
    key: string,
    expiresIn = 3600,
    operation: 'get' | 'put' = 'get',
  ): Promise<string> {
    try {
      const command =
        operation === 'put'
          ? new PutObjectCommand({
              Bucket: this.bucket!,
              Key: key,
            })
          : new GetObjectCommand({
              Bucket: this.bucket!,
              Key: key,
            });

      return await getSignedUrl(this.client!, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate signed URL: ${key}`, error);
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    // Fallback to constructing URL from endpoint
    const endpoint = this.envService.getS3Config().endpoint;
    return `${endpoint}/${this.bucket}/${key}`;
  }

  generateKey(prefix: string, filename: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = filename.split('.').pop();
    return `${prefix}/${timestamp}-${randomString}.${extension}`;
  }
}