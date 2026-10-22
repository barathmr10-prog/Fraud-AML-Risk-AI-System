import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is forwarded to the FastAPI server, so the backend needs no CORS config.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
