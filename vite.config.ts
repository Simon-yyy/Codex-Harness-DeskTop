import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 自定义插件：彻底移除 HTML 中的 type="module" 与 crossorigin 属性，添加 defer 保证 DOM 挂载稳定
function makeElectronCompatible() {
  return {
    name: 'make-electron-compatible',
    transformIndexHtml(html: string) {
      return html
        .replace(/<script\s+type="module"/g, '<script defer')
        .replace(/\s+crossorigin(?:="[^"]*")?/g, '');
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), makeElectronCompatible()],
  base: './',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'ui/dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'CodexDesktopApp',
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        inlineDynamicImports: true
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
