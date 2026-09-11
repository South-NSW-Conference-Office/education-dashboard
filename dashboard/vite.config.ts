import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The backend (Next.js) runs on :3000 by default. In dev the API is proxied so no CORS is
// needed; in production set VITE_API_BASE to the backend origin. When the local IdP stack is
// also running (its frontend owns :3000), start the backend on another port and point
// API_PROXY_TARGET at it, e.g. API_PROXY_TARGET=http://localhost:3010.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: { "/api": { target: process.env.API_PROXY_TARGET || "http://localhost:3000", changeOrigin: true } },
  },
});
