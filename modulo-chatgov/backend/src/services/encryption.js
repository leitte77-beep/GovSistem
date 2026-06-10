import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = config.credsEncryptionKey || 'chatgov-dev-encryption-key-32chars!!';
  return crypto.scryptSync(key, 'chatgov-salt', 32);
}

export function encrypt(text) {
  if (!text) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(typeof text === 'string' ? text : JSON.stringify(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const key = getKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
