/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const apiBase = process.env.MODULE_API_INTERNAL_URL || "http://localhost:9101";
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};
module.exports = nextConfig;
