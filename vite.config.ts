import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves this project from /<repo-name>/ (e.g. /LiveProject_ModelWorkbench/).
  // Relative base keeps assets loadable from any subpath.
  base: './',
  plugins: [react()],
});
