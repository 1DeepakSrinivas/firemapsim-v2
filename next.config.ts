import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mastra/*"],
};

export default withNextra(nextConfig);
