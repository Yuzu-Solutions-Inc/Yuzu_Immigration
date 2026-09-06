import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Enforced framing control. Full policy stays report-only until violations are clean. */
const FRAME_ANCESTORS = "frame-ancestors 'none'";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: blob:",
  "connect-src 'self' https: wss:",
  "worker-src 'self'",
  "frame-src https://accounts.google.com https://login.microsoftonline.com https://js.squareup.com https://web.squarecdn.com",
  FRAME_ANCESTORS,
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://login.microsoftonline.com",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  outputFileTracingExcludes: {
    "*": ["./assets/ircc/blanks/**"],
  },
  async redirects() {
    return [
      {
        source: "/:locale/people",
        destination: "/:locale/partners",
        permanent: true,
      },
      {
        source: "/:locale/people/:path*",
        destination: "/:locale/partners/:path*",
        permanent: true,
      },
      {
        source: "/:locale/clients",
        destination: "/:locale/partners",
        permanent: false,
      },
      {
        source: "/:locale/clients/:path*",
        destination: "/:locale/partners/:path*",
        permanent: false,
      },
      {
        source: "/:locale/billing/projects",
        destination: "/:locale/engagements",
        permanent: false,
      },
      {
        source: "/:locale/projects",
        destination: "/:locale/files",
        permanent: false,
      },
      {
        source: "/:locale/projects/:path*",
        destination: "/:locale/files/:path*",
        permanent: false,
      },
      {
        source: "/:locale/settings/team",
        destination: "/:locale/settings/billing",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/:locale/files",
        destination: "/:locale/projects",
      },
      {
        source: "/:locale/files/:path*",
        destination: "/:locale/projects/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: FRAME_ANCESTORS },
          {
            key: "Content-Security-Policy-Report-Only",
            value: CSP_REPORT_ONLY,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
