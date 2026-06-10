import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const ALL_SECRETS = [
  config.jwtSecret,
  ...config.jwtSecrets,
].filter(Boolean);

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  for (const secret of ALL_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch {}
  }
  throw new Error('Invalid token');
}

export function decodeToken(token) {
  return jwt.decode(token);
}
