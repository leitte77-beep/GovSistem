/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || "http://govouve-api:8000";
    return [
      {
        source: "/api/govouve/:path*",
        destination: `${apiUrl}/api/govouve/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
