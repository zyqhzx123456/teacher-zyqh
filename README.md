# 学校教研组工作台（teacher-workbench）

面向学校教研组的一站式工作台：教研活动管理、教研结论汇总、AI 资料分析、集体备课 / 听评课 / 资源库 / 课题成果，并支持 PWA 安装到桌面、离线打开外壳。

---

## 技术栈

- **前端**：Vite + React 18 + TypeScript + React Router + Tailwind CSS
- **后端（AI 转发）**：Express（`server.js`），把前端请求构造为 prompt 转发给可配置的大模型（默认智谱 GLM，可切换 DeepSeek / Gemini）
- **数据**：前端 Mock 数据 + 浏览器 LocalStorage 持久化（分析页）；AI 调用走可配置的模型 API
- **PWA**：Service Worker（`public/sw.js`）+ Web Manifest（`public/manifest.webmanifest`）

> UI 规范：主色淡紫 `#8B5CF6`、卡片 `rounded-2xl` + `shadow-sm`、电脑端左侧栏分栏、手机端抽屉菜单。

---

## 目录结构

```
teacher-workbench/
├── public/
│   ├── sw.js                 # Service Worker：/api 不缓存、跨域放行、静态资源 cache-first、导航离线回退 index.html
│   ├── manifest.webmanifest  # PWA 清单
│   └── icons/icon.svg        # PWA 图标（512×512 矢量）
├── src/
│   ├── api/analyze.ts        # 前端分析请求：fetch('/api/analyze') + AbortController 超时(30s)
│   ├── components/
│   │   ├── StatCard.tsx       # 概览指标卡片
│   │   ├── TrendChart.tsx     # 原生 Canvas 趋势折线图
│   │   ├── MeasureList.tsx    # 可勾选改进措施清单（结论页）
│   │   └── TeacherTable.tsx   # 教师对比表格（结论页）
│   ├── data/mock.ts          # 全局 Mock 数据（接后端时替换此文件）
│   ├── layout/AppLayout.tsx  # 左右分栏 + 手机端抽屉菜单（含滚动锁/进退场动画）
│   ├── lib/storage.ts        # LocalStorage 安全读写工具
│   ├── pages/
│   │   ├── Dashboard.tsx      # 工作台首页        /
│   │   ├── Conclusion.tsx     # 教研结论页        /conclusion
│   │   ├── Analyze.tsx        # 资料分析（AI）    /analyze
│   │   ├── LessonPrep.tsx     # 集体备课          /lesson-prep
│   │   ├── Observation.tsx    # 听评课            /observation
│   │   ├── Resources.tsx      # 成果上传（原教学资源库，保留上传功能）  /resources
│   │   ├── MaterialLibrary.tsx # 资料库（展示/筛选/预览/下载）            /library
│   │   └── Projects.tsx       # 课题与成果        /projects
│   ├── App.tsx               # 路由表
│   ├── main.tsx              # 入口 + 生产环境注册 SW
│   └── index.css
├── server.js                 # Express AI 转发服务（端口 3001）
├── index.html                # 挂载壳 + manifest/theme-color 链接
├── .env.example              # 环境变量模板
├── package.json
├── vite.config.ts            # /api 代理到 http://localhost:3001
├── tailwind.config.js / postcss.config.js / tsconfig.json
```

---

## 快速开始

### 1. 安装依赖

```bash
cd teacher-workbench
npm install
```

### 2. 启动（开发模式）

前后端是两个进程：**Vite 前端（5173）** 与 **Express AI 服务（3001）**。
Vite 已配置 `/api` 代理到 `3001`，前端同域调用。

**方式 A（推荐，一条命令）** — 需 Node 20.12+（用到 `--env-file-if-exists`）：

```bash
npm run dev:all
```

**方式 B（分开两个终端）**：

```bash
# 终端 1：前端
npm run dev

# 终端 2：AI 转发服务
npm run server
```

启动后访问 **http://localhost:5173/** 。

> 不开 AI 服务也能用：首页 / 结论页 / 4 个功能页 / 离线外壳 / 导出均纯前端可用；
> 只有「资料分析」的「运行分析」需要 AI 服务 + Key。未配置时页面会给出友好提示，不会崩溃。

---

## 配置 AI（模型接入）

「资料分析」页的点「运行分析」会请求 `POST /api/analyze` → `server.js` → 配置的模型 API（默认智谱 GLM-4.7-Flash）。

1. 复制环境变量模板并填入真实 Key：

   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env`：

   | 变量 | 必填 | 默认 | 说明 |
   |------|------|------|------|
   | `AI_API_KEY` | ✅ | — | 模型 API Key（默认智谱 GLM，免费注册获取） |
   | `AI_MODEL` | ❌ | `glm-4.7-flash` | 模型名；可换 `deepseek-chat` / `gemini-2.5-flash` 等 |
   | `AI_API_BASE` | ❌ | `https://open.bigmodel.cn/api/paas/v4` | 模型 API 基址（OpenAI 兼容） |
   | `AI_TEMPERATURE` | ❌ | `0.3` | 采样温度（0=稳定，1=发散） |
   | `AI_TIMEOUT_MS` | ❌ | `60000` | 单次请求超时（毫秒） |
   | `AI_MAX_RETRIES` | ❌ | `2` | 失败重试次数（仅超时/限流/5xx） |
   | `PORT` | ❌ | `3001` | AI 转发服务端口 |

3. 启动服务时 `.env` 会被自动加载（`server` 脚本用了 `--env-file-if-exists=.env`）。
   确认是否正常：

   ```bash
   curl http://localhost:3001/health
   # => {"ok":true,"model":"glm-4.7-flash","configured":true}
   #（旧路径 /api/health 仍可用）
   ```

   > 若 `AI_API_KEY` 缺失，服务会在启动时报错并以非零状态码退出，不会静默降级。

> `.env` 含密钥，**请勿提交到仓库**（已在 `.gitignore` 中忽略，仅保留 `.env.example` 模板）。

---

## 数据持久化

- **资料分析页**：新增的资料、分析结果（highlights/problems/metrics/suggestions）、勾选的改进措施，均写入浏览器 LocalStorage（键名 `twb:analyze:*`），刷新 / 重开浏览器不丢。
- **其余 4 个功能页**（集体备课 / 听评课 / 资源库 / 课题与成果）：当前为内存态 Mock 数据，刷新会重置。
- **Mock 数据**集中在 `src/data/mock.ts`，后续接真实后端时替换该文件即可。

---

## PWA：安装到桌面 / 离线

- **离线外壳**：首次在线访问后断网仍可打开（静态资源 cache-first，导航回退 index.html）。
- **添加到桌面**：需走**生产构建**（Service Worker 仅在 `import.meta.env.PROD` 注册）：

  ```bash
  npm run build
  npm run preview          # 或 npm run server（会托管 dist）
  ```

  用浏览器（Chrome / Edge）打开后，地址栏会出现「安装 / 添加到桌面」提示。
  安全上下文要求：`https` 或 `localhost` 均可。

> 注意：纯 `npm run dev` 下 manifest 已生效，但 SW 不注册，部分浏览器不会给安装提示。

---

## 生产构建与部署

### 本地（单机）部署

```bash
npm run build      # tsc 类型检查 + vite 构建到 dist/
npm run server     # Express 同时托管 dist/ 并提供 /api/*（端口取 process.env.PORT，缺省 3001）
# 然后访问 http://localhost:3001/
```

启动后用 curl 验证服务是否正常（健康检查接口 `/health`）：

```bash
curl http://localhost:3001/health
# => {"ok":true,"model":"glm-4.7-flash","configured":true}
```

> 缺少 `AI_API_KEY` 时服务会在启动时报错并退出（非零码），不会静默运行在 Mock 模式。

### 云端部署（Render）

本项目已附带 `render.yaml`（Render Blueprint），可一键部署。

1. 把代码推送到 GitHub 仓库。
2. 登录 https://dashboard.render.com → **New → Blueprint** → 连接该仓库。
3. Render 自动读取 `render.yaml`：
   - **构建命令（Build Command）**：`npm install && npm run build`
   - **启动命令（Start Command）**：`npm start`（等价 `node --env-file-if-exists=.env server.js`）
   - **健康检查路径（Health Check Path）**：`/health`
4. **配置环境变量（必填）**：Render Dashboard → 你的 Web Service → **Environment** → 新增变量：

   | Key | Value | 说明 |
   |-----|-------|------|
   | `AI_API_KEY` | 你的模型 Key（如智谱 / DeepSeek） | **必须**，缺失则服务启动失败并以非零码退出 |

   可选：`AI_MODEL`、`AI_API_BASE`、`AI_TEMPERATURE`、`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`（见上方配置表）。
5. 部署完成后，Render 分配 `https://<service>.onrender.com`，其 `/health` 即健康检查端点。

> 云端**不要**放 `.env` 文件，密钥一律走平台环境变量；`.env` 已被 `.gitignore` 忽略，不会误提交到仓库。

---

## 单文件版（双击即可打开，无需服务器）

如果你只想把成果**发给同事双击 `index.html` 就能看**，可构建成单文件版：所有 JS/CSS 内联进一个 HTML，路由改用 HashRouter（深链在 `file://` 下也工作），SW 自动跳过。

```bash
npm run build
# 产物：dist/index.html（自包含单文件）
```

双击 `dist/index.html` 即可打开。注意事项：

- **AI 分析用内置 Mock 分析器兜底**：`file://` 下没有后端，`运行分析` 会返回一份确定的演示数据（页面顶部有「离线演示数据」提示），保证交互闭环完整。**真实 AI 分析仍需 `npm run server` + 配置 AI_API_KEY**。
- **PWA「添加到桌面」在 `file://` 下不可用**（不满足安全上下文），离线/安装能力请走上面的生产构建 + `npm run preview`。
- 其余功能（资料新增与 LocalStorage 持久化、可勾选改进措施、导出 HTML/TXT、分享、7 个页面切换、手机端抽屉）在单文件版里均正常工作。

---

## 各页面一览

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 工作台首页 | 数据概览卡片、待办提醒、快捷入口、最近分析结论摘要 |
| `/conclusion` | 教研结论页 | 全组汇总卡片、可勾选改进措施、教师对比表、Canvas 趋势图 |
| `/analyze` | 资料分析（AI） | 资料列表（含分析中状态）、运行 AI 分析、导出 HTML/TXT / 分享组长 |
| `/lesson-prep` | 集体备课 | 备课主题列表 + 行内新增 |
| `/observation` | 听评课 | 听评课记录列表 + 评分进度 |
| `/resources` | 成果上传（原教学资源库） | 资料名称/类型/学科/年级/提交人录入 + 本地文件与链接上传 |
| `/library` | 资料库 | 资料列表（上传人/资料名/学科/年级）+ 按姓名·学科·年级·类型筛选与关键字搜索 + 在线预览/下载（对所有角色开放） |
| `/projects` | 课题与成果 | 课题进度 + 状态标签 + 新增 |

---

## 常见问题

- **点「运行分析」提示「无法连接到 AI 分析服务」**：AI 服务（`npm run server`，3001）未启动，或 `.env` 未配置 Key。先跑 `npm run dev:all`。
- **分析返回「未配置 AI_API_KEY」**：`.env` 没填 Key，或服务启动时 `.env` 不在项目根目录。
- **PWA 不弹安装提示**：SW 只在生产包注册，请用 `npm run build` + `npm run preview` 验证。
- **导出 / 分享按钮**：依赖 `navigator.share` / `clipboard`，需在 `https` 或 `localhost` 下使用（`file://` 直接打开导出文件时分享会走「不支持」分支）。
- **想双击打开、不装 Node**：用 `npm run build` 生成 `dist/index.html` 单文件版（内置 Mock 分析器兜底），直接双击即可。
