import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replit serves the dev server through a proxy, so listen on all hosts.
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
});
