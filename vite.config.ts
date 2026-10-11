import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any host path (GitHub Pages, a preview, a subfolder).
export default defineConfig({
  base: "./",
  plugins: [react()],
  // escape non-ASCII in bundles (some libraries ship literal U+FFFD)
  esbuild: { charset: "ascii" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          web3: ["@solana/kit", "@wallet-standard/app", "@noble/curves/ed25519.js"],
        },
      },
    },
  },
});
