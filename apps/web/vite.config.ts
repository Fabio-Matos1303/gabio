import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
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
        start_url: "/",
        lang: "pt-BR",
        icons: [
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
