import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ cacheDir: `node_modules/.vite-sessions/${process.pid}`, plugins: [react(), tailwindcss()], server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } } }, build: { rollupOptions: { input: { login: resolve(import.meta.dirname,'index.html'), admin: resolve(import.meta.dirname,'admin.html'), faculty: resolve(import.meta.dirname,'faculty.html'), academicCoordinator: resolve(import.meta.dirname,'academic-coordinator.html'), student: resolve(import.meta.dirname,'student.html'), studentCoordinator: resolve(import.meta.dirname,'student-coordinator.html') } } } });
