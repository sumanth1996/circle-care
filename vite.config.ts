import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Content Security Policy (CC-78). Added to production builds only: the dev
 * server needs inline scripts for hot reload. Only our own code runs; images
 * come from us or Unsplash; fonts from Google Fonts. Note: a <meta> CSP can't
 * set frame-ancestors, so anti-framing needs an HTTP header from the host
 * (production backlog, CC-78).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "frame-src blob:",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const csp = (): Plugin => ({
  name: "circle-care-csp",
  apply: "build",
  transformIndexHtml: (html) => html.replace(/(<meta charset="UTF-8" \/>)/, `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
});

/**
 * Development API (CC-190): mounts the Express API on Vite's own server so
 * `npm run dev` serves the app and /api on one port. Production uses
 * server/index.ts instead.
 */
const devApi = (): Plugin => ({
  name: "circle-care-dev-api",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url || !/^\/(api|vault)(\/|$)/.test(req.url)) return next();
      server
        .ssrLoadModule("/server/dev.ts")
        .then((m) => m.getDevApp())
        .then((app) => app(req as never, res as never, next))
        .catch(next);
    });
  },
});

// Replit serves the dev server through a proxy, so listen on all hosts.
export default defineConfig({
  plugins: [react(), csp(), devApi()],
  server: { host: "0.0.0.0", port: 5000, strictPort: true, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
});
