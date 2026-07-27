/** @type {import('next').NextConfig} */
const apiProxyBaseUrl = process.env.SAAS_API_INTERNAL_URL || "http://localhost:9009";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyBaseUrl}/api/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
