import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// scryptSync custa ~40ms de CPU *síncrona* por chamada. Derivar a chave a cada
// encrypt/decrypt bloqueava o event loop por ~1min ao carregar o key store do
// WhatsApp (1000+ chaves), derrubando a sessão por timeout de keep-alive e
// estourando o connectionTimeout do pool do Postgres. A chave é determinística
// (mesma senha + mesmo salt), então derivar uma vez e reusar é equivalente.
let _cachedKey = null;
function getKey() {
  if (_cachedKey) return _cachedKey;
  const key = config.credsEncryptionKey || 'chatgov-dev-encryption-key-32chars!!';
  _cachedKey = crypto.scryptSync(key, 'chatgov-salt', 32);
  return _cachedKey;
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
