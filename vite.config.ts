import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:3005", ws: true },
      "/api": "http://localhost:3005",
      "/reports": "http://localhost:3005",
      "/review-analysis-reports": "http://localhost:3005",
    },
  },
});
