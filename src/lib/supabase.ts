// Supabase 云端数据源客户端
// 项目 URL 与 anon key 一律从环境变量读取（Vite 要求 VITE_ 前缀才会注入前端），
// 严禁硬编码。缺少配置时本模块导出 null，并由页面给出明确的引导提示。
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

/** 是否已配置 Supabase（两者都非空才算配置完成） */
export const isSupabaseConfigured = Boolean(url && anonKey)

/** 缺失配置的明确提示（供界面直接展示） */
export const SUPABASE_MISSING_HINT =
  '尚未配置 Supabase：请在项目根目录 .env 中填入 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY（Supabase 后台 → Project Settings → API），然后重新启动 dev 或重新构建。'

/**
 * 全局唯一的 Supabase 客户端（单例）。
 * 实例在模块内缓存，重复调用不会建立新连接；未配置时返回 null。
 * 工作台已移除账号登录，采用匿名访问（anon key）直接读写共享数据，
 * 因此关闭会话持久化与 URL 中的会话恢复，避免任何账号/会话相关逻辑残留。
 */
let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

/** 全局复用的客户端实例（单例；未配置时为 null） */
export const supabase: SupabaseClient | null = getSupabaseClient()

/** 资料文件归档桶名（需在 Supabase 后台创建为私有桶） */
export const SUBMISSIONS_BUCKET = 'submissions'

/** 签名链接有效期（秒）：用于在线预览与下载 */
export const SIGNED_URL_TTL = 60 * 60

// ---- 连接校验与错误处理 ----

export type ConnectionReason = 'ok' | 'not-configured' | 'network' | 'invalid-key' | 'unknown'

export interface ConnectionCheck {
  ok: boolean
  reason: ConnectionReason
  message: string
}

/**
 * 连接自检：判断是「未配置」「网络异常」还是「凭据无效」，并给出可直接照做的中文提示。
 * 仅做轻量调用（校验凭据有效性），不会写入任何数据。
 */
export async function checkSupabaseConnection(): Promise<ConnectionCheck> {
  const sb = getSupabaseClient()
  if (!isSupabaseConfigured || !sb) {
    return { ok: false, reason: 'not-configured', message: SUPABASE_MISSING_HINT }
  }
  try {
    const { error } = await sb.auth.getSession()
    if (error) {
      const m = (error.message || '').toLowerCase()
      if (/invalid api key|invalid jwt|api key|401|403|unauthorized/.test(m)) {
        return {
          ok: false,
          reason: 'invalid-key',
          message:
            'Supabase 凭据无效（Invalid API key）。请确认 .env 中使用的是 Publishable / anon public 密钥（不是 service_role），且复制完整未被截断，修改后需重启服务。',
        }
      }
      return { ok: false, reason: 'unknown', message: `连接 Supabase 失败：${error.message}` }
    }
    return { ok: true, reason: 'ok', message: '已连接 Supabase' }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/fetch failed|failed to fetch|network|timeout|econn|enotfound|dns/i.test(m)) {
      return {
        ok: false,
        reason: 'network',
        message: `无法连接 Supabase（网络异常）：${m}。请检查网络，并确认项目 URL 正确（形如 https://xxxx.supabase.co，不带尾斜杠）。`,
      }
    }
    return { ok: false, reason: 'unknown', message: `连接 Supabase 异常：${m}` }
  }
}

/** 把 Supabase 返回的英文错误转成面向教师的中文提示 */
export function describeSupabaseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = raw.toLowerCase()
  if (/invalid api key|invalid jwt|unauthorized|401|403/.test(m))
    return '云端凭据无效或已失效，请检查项目密钥配置。'
  if (/fetch failed|failed to fetch|network|timeout|econn/i.test(m))
    return '网络异常，无法连接云端，请检查网络后重试。'
  if (/row-level security|rls|42501/.test(m))
    return '没有该数据的访问权限（云端安全策略拦截），请确认操作的是本人数据。'
  if (/does not exist|pgrst205|42p01/.test(m))
    return '云端数据表尚未创建，请在 Supabase 后台执行 supabase/schema.sql。'
  if (/duplicate key|23505/.test(m)) return '该记录已存在，请勿重复提交。'
  if (/payload|too large|413/.test(m)) return '文件过大，超出云端限制（免费层单文件 50MB）。'
  return raw ? `云端操作失败：${raw}` : '云端操作失败，请稍后重试。'
}
