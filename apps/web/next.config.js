/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@erp/types'],
  typescript: {
    // Type checking is already done by Turbo during the build step.
    // This prevents Vercel from re-checking unrelated API files.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
