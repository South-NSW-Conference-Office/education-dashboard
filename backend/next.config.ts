import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend serves JSON only for now; the React frontend joins this project later.
  serverExternalPackages: ["mongoose", "pdfjs-dist"],
};

export default nextConfig;
