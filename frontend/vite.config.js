import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Explicitly set the base path for assets.
  // This is crucial for deploying to the root of a domain or subdirectory.
  // For root deployment (like Pages), it should typically be '/',
  // but let's make it explicit to ensure Vite knows.
  base: '/',
})
