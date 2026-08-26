/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/govfrota/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8301"}/api/govfrota/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
