import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ command }) => ({
  // 单文件打包插件仅在 build 时启用（dev 下保持原生模块，HMR 正常）
  plugins: [react(), command === 'build' ? viteSingleFile() : null].filter(Boolean) as any,
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    // 将小图（Logo 等）内联为 base64，配合单文件打包确保 Logo 在 dist/index.html 内可离线显示
    assetsInlineLimit: 5 * 1024 * 1024,
  },
}))
