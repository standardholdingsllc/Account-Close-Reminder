/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Vercel serverless function configuration
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
  },

  // Optimize for serverless
  target: 'serverless',

  // API routes configuration
  async rewrites() {
    return [
      // No rewrites needed for this project
    ];
  },

  // Environment variables that should be exposed to the browser
  env: {
    // Don't expose sensitive environment variables here
  }
};

module.exports = nextConfig;
