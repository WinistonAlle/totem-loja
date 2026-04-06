import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        skipWaiting: true,
        globIgnores: [
          "**/assets/Admin-*.js",
          "**/assets/AdminOrders-*.js",
          "**/assets/Avisos-*.js",
          "**/assets/Cadastro-*.js",
          "**/assets/Destaques-*.js",
          "**/assets/Favorites-*.js",
          "**/assets/Login-*.js",
          "**/assets/ReportsDashboard-*.js",
          "**/assets/ReportsCharts-*.js",
          "**/assets/charts-vendor-*.js",
          "**/assets/html2canvas*.js",
          "**/assets/index.es-*.js",
          "**/assets/jspdf*.js",
          "**/assets/logoc-*.png",
          "**/assets/*hero-*.png",
          "**/assets/pdf-vendor-*.js",
          "**/assets/pdf-table-vendor-*.js",
          "**/assets/SystemDiagnostics-*.js",
        ],
      },
    }),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {},
}));
