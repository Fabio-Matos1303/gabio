import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const developmentCsp = (): Plugin => ({
  name: "gabio-development-csp",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace(
      "style-src 'self';",
      "style-src 'self' 'unsafe-inline';",
    );
  },
});

export default defineConfig({
  plugins: [
    developmentCsp(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Gabio",
        short_name: "Gabio",
        description: "Gestão privada da rotina da casa",
        theme_color: "#12261f",
        background_color: "#f4f1e8",
        display: "standalone",
        id: "/",
        scope: "/",
        start_url: "/#tarefas",
        lang: "pt-BR",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
});
