import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Makko Billi Staff",
        short_name: "MBS Staff",
        description: "Staff companion app for Makko Billi School — timetables, attendance, results, notifications and more.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#fffdf7",
        theme_color: "#f6c43d",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Timetable", url: "/timetable", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: "Results", url: "/results", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: "Notifications", url: "/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//],
        importScripts: ["sw-push.js"],
        runtimeCaching: [
          {
            // Read-only API GETs: serve fresh when online, cached when offline.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/api/") === false && url.origin !== self.location.origin
                ? false
                : request.method === "GET" && (url.pathname.startsWith("/api/resource/") || url.pathname.startsWith("/api/method/frappe.client")),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-reads",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/files/"),
            handler: "CacheFirst",
            options: {
              cacheName: "file-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5173 },
});
