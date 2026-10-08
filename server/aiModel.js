// 统一 AI 模型调用模块
// 职责：组装待分析资料内容、设置鉴权请求头、处理超时与失败重试、
// 对返回结果做结构化解析，并针对鉴权失败 / 限流 / 超时 / 返回为空等异常给出明确错误信息。
// 与现有 server.js 风格一致：错误统一抛出带 message 的 Error，由路由层捕获并降级。

import { AI_CONFIG, SYSTEM_PROMPT, buildUserPrompt } from './aiConfig.js'

// 可重试的错误类型（超时 / 限流 / 5xx 服务端错误）；4xx 鉴权/参数错误不重试
const RETRYABLE = new Set(['timeout', 'rate_limited', 'server_error'])

// 去掉大模型可能包裹的 ```json ... ``` 代码围栏，便于稳定解析
function stripFences(text) {
  const t = (text || '').trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : t
}

// 自定义错误：携带 code，便于上层区分处理
class AIModelError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AIModelError'
    this.code = code
  }
}

// 单次模型调用（不含重试）：负责组装请求、发送、解析
async function callOnce(payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs)
  try {
    const resp = await fetch(`${AI_CONFIG.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        temperature: AI_CONFIG.temperature,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
      signal: controller.signal,
    })

    // 鉴权失败：401
    if (resp.status === 401) {
      throw new AIModelError('auth_failed', 'API Key 鉴权失败（401）：请检查 AI_API_KEY 是否正确或已过期。')
    }
    // 限流：429
    if (resp.status === 429) {
      throw new AIModelError('rate_limited', '请求被限流（429）：模型服务调用频率超限，请稍后重试或降低并发。')
    }
    // 其他 4xx：参数错误，不重试
    if (resp.status >= 400 && resp.status < 500) {
      const detail = await resp.text().catch(() => '')
      throw new AIModelError('bad_request', `模型服务返回客户端错误（${resp.status}）：${detail.slice(0, 300)}`)
    }
    // 5xx：服务端错误，可重试
    if (resp.status >= 500) {
      throw new AIModelError('server_error', `模型服务异常（${resp.status}），请稍后重试。`)
    }

    const data = await resp.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content || ''
    if (!text.trim()) {
      throw new AIModelError('empty_response', '模型返回内容为空：服务未产出有效分析文本，请重试。')
    }

    // 结构化解析：去掉可能的 ```json 围栏后整体解析；失败则尝试从文本提取首个 JSON 块
    let parsed
    const cleaned = stripFences(text)
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0])
        } catch {
          // 仍无法解析：返回原始文本，由上层标记 raw
          parsed = { raw: text }
        }
      } else {
        parsed = { raw: text }
      }
    }

    return {
      ...parsed,
      mock: false,
      source: 'ai',
      model: AI_CONFIG.model,
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AIModelError('timeout', `模型调用超时（${AI_CONFIG.timeoutMs / 1000}s），请稍后重试。`)
    }
    if (err instanceof AIModelError) throw err
    // 网络层错误（DNS / 连接拒绝 / TLS 等）：视为可重试的服务端不可达
    throw new AIModelError('server_error', `无法连接模型服务：${err.message || '未知网络错误'}`)
  } finally {
    clearTimeout(timer)
  }
}

// 对外统一入口：带失败重试（仅限超时 / 限流 / 5xx / 网络错误）
// 调用方式：const result = await callAIModel(payload)
export async function callAIModel(payload) {
  let lastErr
  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      return await callOnce(payload)
    } catch (err) {
      lastErr = err
      const code = err.code || ''
      if (!RETRYABLE.has(code)) break // 4xx 鉴权/参数错误立即抛出，不重试
      if (attempt < AI_CONFIG.maxRetries) {
        // 简单退避：指数退避（500ms, 1s, 2s...）
        const backoff = Math.min(500 * 2 ** attempt, 5000)
        console.warn(`[aiModel] 第 ${attempt + 1} 次调用失败（${code}），${backoff}ms 后重试…`)
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  }
  // 重试耗尽：抛出最后一次错误，由路由层捕获降级
  throw lastErr
}
