import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 3001,
    open: true,
    cors: true,
    strictPort: true,
    proxy: {
      // Enhanced Socket.IO proxy with improved WebSocket handling
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
    },
    hmr: {
      overlay: true,
      clientPort: 3001,
    },
    allowedHosts: ["localhost", "127.0.0.1", "hen-clear-hornet.ngrok-free.app"],
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
  // Exclude socket.io-client from Vite processing
  optimizeDeps: {
    exclude: ["socket.io-client"],
  },
});
