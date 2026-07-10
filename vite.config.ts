import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [],
  server: {
    // Default 5173; PORT lets tooling pick a free port without edits here.
    port: Number(process.env.PORT) || 5173
  }
});
