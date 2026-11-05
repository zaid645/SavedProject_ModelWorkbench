import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves this project from /SavedProject_ModelWorkbench/.
  // Relative asset URLs also keep the build usable from a subdirectory.
  base: './',
  plugins: [react()],
});
