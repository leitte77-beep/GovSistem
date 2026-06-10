/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/govtask/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8101"}/api/govtask/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
