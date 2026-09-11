import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend serves JSON only; the React frontend is a separate Vite app.
  serverExternalPackages: ["mongoose", "pdfjs-dist"],
  // Docker builds set NEXT_STANDALONE=1 for the minimal server.js output
  // (backend/Dockerfile); plain `next dev`/`next build` behaviour is unchanged.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
