/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
