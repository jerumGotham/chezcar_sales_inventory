import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["tesseract.js", "@tesseract.js-data/eng"],
};

export default nextConfig;
