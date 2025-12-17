/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@cloudflare/workers-types'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'utf-8-validate': 'commonjs utf-8-validate',
        'bufferutil': 'commonjs bufferutil',
        'supports-color': 'commonjs supports-color',
      });
    }
    return config;
  },
};

module.exports = nextConfig;