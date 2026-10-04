import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Public base path (for example /erp-agent-lab/ on GitHub Pages), set through VITE_BASE.
  base: loadEnv(mode, process.cwd(), "VITE_").VITE_BASE || "/",
}));
