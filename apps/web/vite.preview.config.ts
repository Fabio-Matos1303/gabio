import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";
const require = createRequire(new URL("./package.json", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("../../scripts/preview", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@gabio/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url),
      ),
      "react-dom": dirname(require.resolve("react-dom/package.json")),
      react: dirname(require.resolve("react/package.json")),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5182,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
