import { config } from '../config.js';

const rateLimitMap = new Map();

export function rateLimiter(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const tenantId = req.operador?.tenantId || 'anon';
  const operadorId = req.operador?.id || 'anon';
  const key = `${tenantId}:${operadorId}:${req.method}:${req.path}`;
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = config.rateLimitPerMinute || 30;

  let entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return res.status(429).json({
      erro: 'Muitas requisições. Aguarde um momento.',
      retryAfter: Math.ceil((entry.start + windowMs - now) / 1000),
    });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.start > 60000) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);
