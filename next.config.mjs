/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  reactStrictMode: true,
  experimental: {
    turbo: {
      resolveAlias: {
        '@/dictionaries/*.json': '@/dictionaries/*',
      },
    },
  },
};

export default nextConfig;
