import nextI18nConfig from './next-i18next.config.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        // port: '' // Add port if your dev server uses a specific one other than 80/443
        // pathname: '/images/**' // Optional: restrict to specific paths
      },
    ],
  },
  reactStrictMode: true,
  i18n: nextI18nConfig.i18n,
  // If using experimental features, keep them here
  // experimental: {
  //   ...
  // },
};

export default nextConfig;
