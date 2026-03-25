import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true,
    allowedHosts: ["funcionarios.gostinhomineiro.com"],
  },

  plugins: [
    react(),

    // PWA
    VitePWA({
      // ✅ injeta o registro automaticamente (sem precisar mexer no main.tsx)
      injectRegister: "auto",
      registerType: "autoUpdate",
      cleanupOutdatedCaches: true,

      // Evita SW ativo em desenvolvimento, que costuma deixar caches/states quebrados.
      devOptions: { enabled: false },

      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Catálogo de Funcionários",
        short_name: "Catálogo",
        description: "Sistema interno de pedidos e painéis",
        theme_color: "#9E0F14",
        background_color: "#9E0F14",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        skipWaiting: true,
      },
    }),

    mode === "production" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }

          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("victory-vendor")
          ) {
            return "charts-vendor";
          }

          if (id.includes("jspdf") || id.includes("html2canvas")) {
            return "export-vendor";
          }

          if (id.includes("styled-components")) {
            return "styled-vendor";
          }

          if (id.includes("lucide-react")) {
            return "icons-vendor";
          }

          return "vendor";
        },
      },
    },
  },
}));
