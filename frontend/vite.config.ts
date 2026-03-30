import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Vite configuration for the Logmind frontend.
// Load .env from repo root so VITE_API_URL and other vars are shared.
export default defineConfig({
  plugins: [react()],
  envDir: "..",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
