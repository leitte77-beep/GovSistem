import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { config } from '../config.js';

const UPLOADS_DIR = config.uploadsDir;

try {
  mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {}

export class LocalStorage {
  async salvar(buffer, mime, tenantId) {
    const ext = mimeToExt(mime);
    const id = randomBytes(16).toString('hex');
    const filename = `${id}.${ext}`;
    const tenantDir = join(UPLOADS_DIR, 'tenants', tenantId, 'media');
    mkdirSync(tenantDir, { recursive: true });
    const filepath = join(tenantDir, filename);
    await writeFile(filepath, buffer);
    return `/media/tenants/${tenantId}/media/${filename}`;
  }

  async obter(url, tenantId) {
    const relative = url.replace('/media/', '');
    const filepath = join(UPLOADS_DIR, relative);
    if (!existsSync(filepath)) return null;
    return readFile(filepath);
  }
}

class S3Storage {
  constructor() {
    this.s3Client = null;
    this.initialized = false;
  }

  async _ensureClient() {
    if (this.s3Client) return this.s3Client;
    if (!this.initialized) {
      try {
        const { S3Client } = await import('@aws-sdk/client-s3');
        this.s3Client = new S3Client({
          region: config.s3Region,
          endpoint: config.s3Endpoint || undefined,
          credentials: {
            accessKeyId: config.s3AccessKey,
            secretAccessKey: config.s3SecretKey,
          },
          forcePathStyle: true,
        });
        this.initialized = true;
      } catch (err) {
        console.error('[S3Storage] Failed to initialize:', err.message);
        throw err;
      }
    }
    return this.s3Client;
  }

  async salvar(buffer, mime, tenantId) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const ext = mimeToExt(mime);
    const id = randomBytes(16).toString('hex');
    const key = `tenants/${tenantId}/media/${id}.${ext}`;

    const client = await this._ensureClient();
    await client.send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    }));

    const endpoint = config.s3Endpoint ? `${config.s3Endpoint}/${config.s3Bucket}` : `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com`;
    return `${endpoint}/${key}`;
  }

  async obter(url, tenantId) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const key = url.split('/').slice(-3).join('/');
    const client = await this._ensureClient();
    const response = await client.send(new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    }));
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

function mimeToExt(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
  };
  return map[mime] || 'bin';
}

export function createStorage() {
  if (config.storageDriver === 's3' || config.storageDriver === 'minio') {
    try {
      return new S3Storage();
    } catch {
      console.warn('[Storage] S3 not available, falling back to local storage');
    }
  }
  return new LocalStorage();
}
