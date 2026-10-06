import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Same resolution as configuredBlobHost() in src/lib/media.ts: pin the image optimizer to our own store.
const blobStoreId = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3]?.toLowerCase();
const pinnedBlobHost =
  process.env.BLOB_STORE_HOST?.trim() || (blobStoreId ? `${blobStoreId}.public.blob.vercel-storage.com` : "");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BLOB_HOST: pinnedBlobHost },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: pinnedBlobHost || '*.public.blob.vercel-storage.com',
        pathname: '/uploads/**',
        search: '',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
