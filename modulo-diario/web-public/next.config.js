/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://api.qrserver.com https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https://api.qrserver.com https://*.googleusercontent.com https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "font-src 'self' data: https://fonts.gstatic.com https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "connect-src 'self' data: blob: https://api.govsistem.com.br https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "worker-src 'self' blob:",
              "media-src 'self' blob: https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net",
              "frame-src 'self' https://diario.govsistem.com.br https://www.google.com https://vlibras.gov.br https://*.vlibras.gov.br",
              "frame-ancestors 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/download/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.govsistem.com.br" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "api.qrserver.com" },
    ],
  },
  async rewrites() {
    // Server-side proxy so the browser stays same-origin (avoids CORS) and the
    // semantic snapshot/download routes reach the API. In production, nginx
    // already routes /api to the backend, so these rewrites are inert there.
    const apiHost = (process.env.API_URL || "http://api:8000/api/v1").replace(/\/api\/v1\/?$/, "");
    return [
      { source: "/api/public/:path*", destination: `${apiHost}/api/public/:path*` },
      { source: "/api/v1/:path*", destination: `${apiHost}/api/v1/:path*` },
      { source: "/api/health", destination: `${apiHost}/api/health` },
    ];
  },
};

module.exports = nextConfig;
