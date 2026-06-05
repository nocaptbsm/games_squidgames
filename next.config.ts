import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── TypeScript ────────────────────────────────────────────────────────────
  typescript:  { ignoreBuildErrors: false },

  // ── Compiler ──────────────────────────────────────────────────────────────
  compress:    true,   // gzip responses from the Node server

  // Silence Turbopack warning when using custom webpack config
  turbopack: {},

  // ── Package import optimisation ───────────────────────────────────────────
  experimental: {
    optimizePackageImports: [
      "framer-motion",
      "zustand",
    ],
  },

  // ── HTTP headers ──────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source:  "/audio/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source:  "/:path*.(ico|svg|png|webmanifest)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" }],
      },
      {
        source:  "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",          value: "DENY"    },
          { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
        ],
      },
      // dalgona.html is served inside a same-origin iframe by DalgonaCandy.tsx.
      // The rule above sets X-Frame-Options: DENY for all routes; this specific
      // override MUST come after that rule so it wins the merge for this path only.
      // SAMEORIGIN allows same-origin iframes while still blocking cross-origin framing.
      {
        source:  "/dalgona.html",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },

  // ── Webpack ───────────────────────────────────────────────────────────────
  webpack(config, { isServer }) {
    if (isServer) return config;

    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...(config.optimization?.splitChunks as object ?? {}),
        cacheGroups: {
          vendor: {
            test:     /[\\/]node_modules[\\/](react|react-dom|framer-motion|zustand)[\\/]/,
            name:     "vendor",
            chunks:   "all",
            priority: 20,
          },
          gameRLGL: {
            test:     /[\\/]components[\\/]games[\\/]RedLightGreenLight/,
            name:     "game-rlgl",
            chunks:   "async",
            priority: 10,
          },
          gameGB: {
            test:     /[\\/]components[\\/]games[\\/]GlassBridge/,
            name:     "game-glass-bridge",
            chunks:   "async",
            priority: 10,
          },
          gameDalg: {
            test:     /[\\/]components[\\/]games[\\/]DalgonaCandy/,
            name:     "game-dalgona",
            chunks:   "async",
            priority: 10,
          },
          gameEngine: {
            test:     /[\\/](engine|hooks|managers|utils)[\\/]/,
            name:     "game-engine",
            chunks:   "async",
            priority: 5,
            minChunks: 2,   
          },
        },
      },
    };

    return config;
  },
};

export default nextConfig;