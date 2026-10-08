import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)

// 仅在生产环境、且非 file:// 协议下注册 Service Worker。
// （双击打开的 file:// 单文件版没有后端、也不需要离线缓存，注册 SW 会报错且无意义）
if (import.meta.env.PROD && location.protocol !== 'file:' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW 注册失败:', err)
    })
  })
}
