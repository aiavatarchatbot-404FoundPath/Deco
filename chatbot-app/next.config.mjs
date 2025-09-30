// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'models.readyplayer.me',
      'cdn.readyplayer.me',
      'rpmtmpstorage.blob.core.windows.net',
    ],
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
