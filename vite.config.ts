import { defineConfig } from "vite";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        popup: resolve(import.meta.dirname, "src/popup.html"),
        options: resolve(import.meta.dirname, "src/options.html"),
      },
    },
  },
  plugins: [tailwindcss()],
});
