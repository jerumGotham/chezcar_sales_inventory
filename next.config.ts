import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    /*
     * Off, although Next 16 defaults it on. Turbopack's on-disk cache keeps the
     * previous module graph, and removing an import leaves it serving a chunk
     * that still requires the module that went away: the page then fails with
     * "the module factory is not available", which no browser reload can clear
     * because the stale chunk comes from the server. The build cache is left
     * alone; only the development one caused this.
     */
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
