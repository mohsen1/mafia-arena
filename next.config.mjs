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
};

export default nextConfig;
