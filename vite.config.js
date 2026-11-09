import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Numero de version unique a chaque build. Il est grave dans le code de l'app
// (__BUILD_ID__) ET publie dans /version.json. L'app compare les deux : si le
// fichier en ligne est different, une nouvelle version existe -> bouton "Mettre a jour".
const BUILD_ID = String(Date.now());

const versionJson = () => ({
  name: "tht-version-json",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), versionJson()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { outDir: "dist" },
});
