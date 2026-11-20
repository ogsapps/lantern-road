import { defineConfig } from 'vite';

// Relative base so the build works from a GitHub Pages project subpath
// (https://<owner>.github.io/<repo>/) without hardcoding the repo name.
export default defineConfig({
  base: './',
});
