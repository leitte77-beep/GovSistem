/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/govouve/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8201"}/api/govouve/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
