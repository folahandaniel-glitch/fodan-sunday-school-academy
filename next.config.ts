import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.paystack.com",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "pg", "@electric-sql/pglite", "sharp", "mammoth", "docx"],
  outputFileTracingIncludes: { "/**": ["./data/bible/**", "./drizzle/**", "./public/brand/**"] },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
