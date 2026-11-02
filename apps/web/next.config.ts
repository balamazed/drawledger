import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://coralrpc.mstblockchain.com";
const rpcOrigin = new URL(rpc).origin;
const wsOrigin = rpcOrigin.replace(/^http/, "ws");

// Strict headers in production; dev needs eval for fast refresh
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${rpcOrigin} ${wsOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  transpilePackages: ["@drawledger/core"],
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Ship the schema file with the serverless bundle so the database can self-initialise
  outputFileTracingIncludes: { "/**": ["./db/schema.sql"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
