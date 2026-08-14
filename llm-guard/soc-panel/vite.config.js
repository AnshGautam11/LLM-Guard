import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SOC panel is a separate application from the main console
// (frontend/), so it runs on its own port. Start it with:
//   cd soc-panel && npm install && npm run dev
// then open http://localhost:5174/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
