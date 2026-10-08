// 轻量、安全的 LocalStorage 读写：不可用时（隐私模式 / 容量满 / SSR）静默降级
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 静默降级，不影响主流程 */
  }
}

// 升级到 v2：旧 v1 键中残留的演示资料（a1~a5）随之失效，刷新即展示空状态。
export const LS_KEYS = {
  analyzeMaterials: 'twb:v2:analyze:materials',
  analyzeResults: 'twb:v2:analyze:results',
  analyzeChecked: 'twb:v2:analyze:checked',
}
