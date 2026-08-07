export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');

  res.setHeader(
    'Strict-Transport-Security',
    process.env.NODE_ENV === 'production'
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0'
  );

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob:",
      "connect-src 'self' wss: ws: https:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')
  );

  res.removeHeader('X-Powered-By');
  next();
}

export function cacheControlPublico(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

export function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/on\w+\s*=\s*'[^']*'/gi, '')
          .replace(/javascript\s*:/gi, '');
      }
    }
  }
  next();
}

import db from '../db.js';

export async function auditLog(acao, req, res) {
  try {
    await db.none(
      `INSERT INTO auditoria (tenant_id, operador_id, acao, entidade, entidade_id, detalhe, origem, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,'api',$7,$8)`,
      [
        req.operador?.tenantId || req.tenantId || null,
        req.operador?.id || null,
        acao,
        'protocolo',
        req.params?.id || null,
        JSON.stringify({ method: req.method, path: req.path, status: res.statusCode }),
        req.ip,
        req.get('user-agent') || null,
      ]
    );
  } catch {}
}
