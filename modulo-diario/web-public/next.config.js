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
              "script-src 'self' 'unsafe-inline' https://api.qrserver.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https://api.qrserver.com https://*.googleusercontent.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://api.govsistem.com.br",
              "frame-src 'self' https://diario.govsistem.com.br",
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
