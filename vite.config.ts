import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// aviso de autoria preservado no topo dos arquivos gerados: sobrevive à
// minificação e acompanha o bundle caso ele seja copiado
const banner = `/*! Elifoot 3K | Copyright (c) 2026 Rvt7788 <rafaelvteixeira@gmail.com> | Todos os direitos reservados. Licenca proprietaria: copia, modificacao ou redistribuicao sao proibidas sem autorizacao escrita. */`;

export default defineConfig({
  build: {
    rollupOptions: {
      output: { banner },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png"],
      manifest: {
        name: "Elifoot 3K",
        short_name: "Elifoot 3K",
        description: "Manager de futebol do futuro",
        start_url: "/",
        display: "standalone",
        background_color: "#09090b",
        theme_color: "#09090b",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,json}"],
        // a imagem de compartilhamento só é lida pelos robôs de link: no
        // precache ela custaria 64KB de download a cada jogador, à toa
        globIgnores: ["og.png"],
      },
    }),
  ],
});
