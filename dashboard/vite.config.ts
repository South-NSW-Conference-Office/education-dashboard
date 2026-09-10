import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The backend (Next.js) runs on :3000. In dev the API is proxied so no CORS is needed;
// in production set VITE_API_BASE to the backend origin.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: Number(process.env.PORT) || 5173, proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } } },
});
