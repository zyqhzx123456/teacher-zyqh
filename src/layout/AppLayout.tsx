import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { RoleProvider, useRole, ROLE_LABEL, LEADER_GROUP, type Role } from '../lib/role'
import { researchGroups } from '../data/mock'
import schoolLogo from '../assets/school-logo.jpg'
import schoolMotto from '../assets/school-motto.jpg'

const ALL_NAV = [
  { to: '/', label: '工作台首页', icon: '🏠' },
  { to: '/groups', label: '教研组', icon: '👥' },
  // 「成果上传」（原「教学资源库」）位于「教研组」下方，保留原入口位置与上传功能
  { to: '/resources', label: '成果上传', icon: '📚' },
  // 「资料库」紧随「成果上传」之后，展示其提交的资料，对所有角色开放
  { to: '/library', label: '资料库', icon: '🗂️' },
  { to: '/analyze', label: '资料分析', icon: '🤖' },
  // 菜单调整：「教研结论页」移动至「资料分析」正后方，紧随其后（图标/路由/权限不变）
  { to: '/conclusion', label: '教研结论页', icon: '📊' },
  { to: '/lesson-prep', label: '集体备课', icon: '📝' },
  { to: '/observation', label: '听评课', icon: '👀' },
  { to: '/projects', label: '课题与成果', icon: '🏆' },
]

// 教研组长：可访问 教研组 / 成果上传 / 资料库 / 资料分析 / 教研结论页
const LEADER_NAV = ALL_NAV.filter((n) =>
  ['/groups', '/analyze', '/resources', '/library', '/conclusion'].includes(n.to),
)
const LEADER_ALLOWED = LEADER_NAV.map((n) => n.to)

// 老师：仅可访问「成果上传」与「资料库」
const TEACHER_NAV = ALL_NAV.filter((n) => ['/resources', '/library'].includes(n.to))

// 登录页：角色 + 口令（线上登录与本机登录统一使用此界面，无邮箱、无注册）
// 未登录时只显示本入口；登录成功后进入工作台。
function LoginScreen() {
  const { login, configured, missingHint } = useRole()
  const [role, setRole] = useState<Role>('teacher')
  const [password, setPassword] = useState('')
  const [leaderGroup, setLeaderGroup] = useState<string>(LEADER_GROUP)
  const [err, setErr] = useState('')
  const passwordless = role === 'teacher'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = login(role, password, role === 'leader' ? leaderGroup : undefined)
    if (msg) setErr(msg)
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex items-center px-6 py-4">
        <img
          src={schoolLogo}
          alt="遵义清华中学"
          className="h-10 w-auto mix-blend-multiply"
          style={{ transform: 'scale(1.25)', transformOrigin: 'top left' }}
        />
      </header>
      <main className="flex-1 grid place-items-center px-4">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md min-w-0 rounded-3xl bg-white shadow-sm border border-slate-100 p-8 space-y-5"
        >
          <div className="text-center">
            <div className="text-xl font-semibibold text-slate-800 leading-tight">遵义清华中学教研工作台</div>
            <div className="mt-1.5 text-slate-400 truncate text-[clamp(11px,3.4vw,12px)]">
              Teaching &amp; Research Workbench of Zunyi Tsinghua High School
            </div>
          </div>

          {configured ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              已接入云端：请选择角色登录，资料可跨设备共享。
            </p>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 leading-relaxed">
              未接入云端：请选择角色登录，资料仅保存在本机，不会跨设备同步。{missingHint}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm text-slate-500">角色</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role)
                setPassword('')
                setErr('')
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                  {r === 'teacher' ? '（免密码直接登录）' : ''}
                </option>
              ))}
            </select>
          </div>

          {role === 'leader' && (
            <div className="space-y-2">
              <label className="block text-sm text-slate-500">教研组</label>
              <select
                value={leaderGroup}
                onChange={(e) => {
                  setLeaderGroup(e.target.value)
                  setErr('')
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
              >
                {researchGroups.map((g) => (
                  <option key={g.subject} value={g.subject}>
                    {g.subject}教研组
                  </option>
                ))}
              </select>
            </div>
          )}

          {passwordless ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm text-slate-600 flex items-center justify-between">
              <span>免密码直接登录</span>
              <span className="text-slate-400">→</span>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm text-slate-500">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErr('')
                }}
                placeholder="请输入登录密码"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          )}

          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-brand-500 text-white text-sm py-2.5 hover:bg-brand-600 transition"
          >
            登录
          </button>
        </form>
      </main>
      <footer className="flex justify-center py-6">
        <img
          src={schoolMotto}
          alt="自强不息，厚德载物"
          className="w-48 opacity-70 mix-blend-multiply"
        />
      </footer>
    </div>
  )
}

function SidebarContent({ nav, onNav }: { nav: typeof ALL_NAV; onNav?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-brand-500 text-white grid place-items-center font-bold">教</div>
        <div className="leading-tight">
          <div className="font-semibold text-slate-800">遵义清华中学<br />教研工作台</div>
          <div className="text-xs text-slate-400">Teaching Research</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={onNav}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function AppLayoutInner() {
  const { loggedIn, role, logout, isGroupScoped, configured, missingHint } = useRole()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // 抽屉打开时锁定页面背景滚动，关闭后还原
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // 退出登录后关闭抽屉，避免停留在锁定态
  useEffect(() => {
    if (!loggedIn) setOpen(false)
  }, [loggedIn])

  // 未登录：任意页面均显示登录页（禁止通过地址直接绕过）
  if (!loggedIn) return <LoginScreen />

  // 老师越权访问拦截：仅可访问「成果上传」与「资料库」，其余重定向回「成果上传」
  if (role === 'teacher' && !['/resources', '/library'].includes(location.pathname)) {
    return <Navigate to="/resources" replace />
  }

  // 教研组长越权访问拦截：仅允许 教研组 / 成果上传 / 资料库 / 资料分析，其余重定向回教研组
  if (isGroupScoped && !LEADER_ALLOWED.includes(location.pathname)) {
    return <Navigate to="/groups" replace />
  }

  const nav = role === 'teacher' ? TEACHER_NAV : isGroupScoped ? LEADER_NAV : ALL_NAV

  return (
    <div className="flex h-full">
      {/* 电脑端：左侧固定分栏 */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-100">
        <SidebarContent nav={nav} />
      </aside>

      {/* 手机端：抽屉菜单（始终挂载，靠过渡类做进退场动画） */}
      <div className={`fixed inset-0 z-40 md:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-64 bg-white shadow-xl transition-transform duration-200 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent nav={nav} onNav={() => setOpen(false)} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 md:px-8 bg-white border-b border-slate-100 sticky top-0 z-30">
          <button
            className="md:hidden p-2 -ml-2 rounded-xl hover:bg-slate-100"
            onClick={() => setOpen(true)}
            aria-label="菜单"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">
              当前：{ROLE_LABEL[role]}
              {!configured && ' · 本机模式'}
            </span>
            <button
              onClick={() => {
                logout() // 清除本地登录态
                navigate('/', { replace: true }) // 回到根路由，由登录门禁渲染登录页
              }}
              className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-rose-500 transition"
            >
              退出
            </button>
          </div>
        </header>

        {/* 未接入云端数据源时的说明（不影响登录与使用，仅提示数据存放位置） */}
        {!configured && (
          <div className="px-4 md:px-8 pt-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 leading-relaxed">
              当前未接入云端数据源：资料仅保存在本机浏览器。{missingHint}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function AppLayout() {
  return (
    <RoleProvider>
      <AppLayoutInner />
    </RoleProvider>
  )
}
