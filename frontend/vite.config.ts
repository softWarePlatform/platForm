import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    /** 5173 被占用时直接报错，避免静默改到 5174 导致浏览器仍打开旧实例 */
    strictPort: true,
    proxy: {
      "^/api/(lab-sets|labs|submissions|practice|discussion-attachments)(/|$)": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "^/api/courses/[^/]+/(labs|lab-sets|practice|discussions|discussion-members)(/|$)": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // 其余 /api 请求交给 api-gateway。不用 8080（compose nginx），也不用 3080（本机常被占用）。
      "/api": {
        target: "http://127.0.0.1:3081",
        changeOrigin: true,
      },
    },
  },
});
