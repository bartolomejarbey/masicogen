import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@masico/shared", "@masico/render"]
};

export default nextConfig;
