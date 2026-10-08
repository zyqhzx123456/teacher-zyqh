import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Conclusion from './pages/Conclusion'
import Analyze from './pages/Analyze'
import LessonPrep from './pages/LessonPrep'
import Observation from './pages/Observation'
import Resources from './pages/Resources'
import Projects from './pages/Projects'
import Groups from './pages/Groups'
import MaterialLibrary from './pages/MaterialLibrary'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 路由顺序与导航菜单顺序保持一致（菜单展示顺序以 AppLayout 的 ALL_NAV 为准） */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/library" element={<MaterialLibrary />} />
        <Route path="/analyze" element={<Analyze />} />
        <Route path="/conclusion" element={<Conclusion />} />
        <Route path="/lesson-prep" element={<LessonPrep />} />
        <Route path="/observation" element={<Observation />} />
        <Route path="/projects" element={<Projects />} />
        {/* 兜底路由：未匹配的路径也必须挂载 AppLayout（从而进入登录门禁/按角色重定向），
            否则无路径匹配时整棵树不渲染，会出现白屏 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
