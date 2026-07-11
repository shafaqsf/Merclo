import type { NextConfig } from "next";

// When testing the embeddable widget on a real (HTTPS) storefront during
// development, the app is exposed through a tunnel (ngrok / Cloudflare). Next's
// dev server otherwise blocks requests whose Host is the tunnel domain, so we
// allow the common tunnel hosts plus anything listed in DEV_ALLOWED_ORIGINS
// (comma-separated hostnames).
const extraDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    ...extraDevOrigins,
  ],
};

export default nextConfig;
