// 角色登录：基于「角色 + 口令」的本地登录，无账号、无邮箱、无会话、无注册。
// 角色（老师 / 教研组长 / 管理员 / 教研校长）决定可见栏目与数据范围；
// 是否接入云端（Supabase）只影响数据存放位置（云端共享 / 本机），不影响登录方式。
// 移除邮箱登录后，线上登录与本机登录统一使用本「角色 + 口令」界面。
import { createContext, useContext, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, SUPABASE_MISSING_HINT } from './supabase'

// 角色：老师 / 教研组长 / 管理员 / 教研校长
export type Role = 'teacher' | 'leader' | 'admin' | 'principal'

export const ROLE_LABEL: Record<Role, string> = {
  teacher: '老师',
  leader: '教研组长',
  admin: '管理员',
  principal: '教研校长',
}

// 教研组长默认绑定的教研组
export const LEADER_GROUP = '综合'

// 可查看全量数据（不受教研组范围限制）：管理员 / 教研校长
export function canViewAll(role: Role): boolean {
  return role === 'admin' || role === 'principal'
}

// 教研组范围受限（仅本教研组）：教研组长
export function isGroupScoped(role: Role): boolean {
  return role === 'leader'
}

const ROLE_KEY = 'twb:role'
const GROUP_KEY = 'twb:role:group'
const LOGGED_KEY = 'twb:loggedIn'

// 角色口令（演示级）：老师免密码直接登录；其余角色凭口令登录
export const ROLE_PASSWORDS: Record<Exclude<Role, 'teacher'>, string> = {
  leader: 'jy123456',
  admin: 'dms123456',
  principal: 'oyq123456',
}

interface RoleCtx {
  role: Role
  group: string
  /** 是否已登录（角色 + 口令校验通过） */
  loggedIn: boolean
  /** 云端数据源是否已配置（仅影响数据存于云端还是本机，不影响能否进入） */
  configured: boolean
  missingHint: string
  /** 角色 + 口令登录；返回 null 表示成功，否则返回错误提示 */
  login: (r: Role, password: string, group?: string) => string | null
  /** 退出登录，清除本地登录态 */
  logout: () => void
  canViewAll: boolean
  isGroupScoped: boolean
}

const Ctx = createContext<RoleCtx | null>(null)

function normalizeRole(v: unknown): Role {
  return v === 'leader' || v === 'admin' || v === 'principal' ? v : 'teacher'
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => normalizeRole(localStorage.getItem(ROLE_KEY)) || 'teacher')
  const [group, setGroupState] = useState<string>(() => localStorage.getItem(GROUP_KEY) || LEADER_GROUP)
  const [loggedIn, setLoggedIn] = useState<boolean>(() => localStorage.getItem(LOGGED_KEY) === '1')

  const login = (r: Role, password: string, g?: string): string | null => {
    // 老师免密码；其余角色校验口令
    if (r !== 'teacher' && ROLE_PASSWORDS[r] !== password) return '密码错误，请重新输入'
    const grp = r === 'leader' ? g || LEADER_GROUP : ''
    localStorage.setItem(ROLE_KEY, r)
    localStorage.setItem(GROUP_KEY, grp)
    localStorage.setItem(LOGGED_KEY, '1')
    setRoleState(r)
    setGroupState(grp)
    setLoggedIn(true)
    return null
  }

  const logout = () => {
    localStorage.removeItem(ROLE_KEY)
    localStorage.removeItem(GROUP_KEY)
    localStorage.removeItem(LOGGED_KEY)
    setLoggedIn(false)
    setRoleState('teacher')
    setGroupState(LEADER_GROUP)
  }

  return (
    <Ctx.Provider
      value={{
        role,
        group,
        loggedIn,
        configured: isSupabaseConfigured,
        missingHint: SUPABASE_MISSING_HINT,
        login,
        logout,
        canViewAll: canViewAll(role),
        isGroupScoped: isGroupScoped(role),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useRole(): RoleCtx {
  return useContext(Ctx) || {
    role: 'teacher',
    group: LEADER_GROUP,
    loggedIn: false,
    configured: isSupabaseConfigured,
    missingHint: SUPABASE_MISSING_HINT,
    login: () => null,
    logout: () => {},
    canViewAll: false,
    isGroupScoped: false,
  }
}
