import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any host path (GitHub Pages, a preview, a subfolder).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          web3: ["wagmi", "viem", "@tanstack/react-query"],
        },
      },
    },
  },
});
