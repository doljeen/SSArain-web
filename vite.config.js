import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://ec2-13-124-222-178.ap-northeast-2.compute.amazonaws.com",
        changeOrigin: true
      }
    }
  }
});
