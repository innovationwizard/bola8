/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.leonardo.ai',
      },
      {
        // Supabase Storage — set NEXT_PUBLIC_SUPABASE_HOSTNAME to your project ref
        // e.g. abcdefghijklmn.supabase.co
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_SUPABASE_HOSTNAME || '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = nextConfig;
