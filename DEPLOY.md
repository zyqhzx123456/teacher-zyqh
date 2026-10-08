# 教研工作台 · 云端部署指南

## 一、技术栈识别与方案选型

| 识别项 | 结论 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite，`npm run build` 产出**单文件** `dist/index.html`（自包含 JS/CSS） |
| 后端 | Express（`server.js`）+ 原生模块 `better-sqlite3` |
| 数据 | SQLite 文件库（`data/submit.db`）+ 服务端文件归档（`uploads/`） |
| 外部服务 | 智谱 GLM（`AI_API_KEY` 调用 `/chat/completions`） |
| 运行方式 | **全栈**：同一 Node 进程既提供 `/api/*`，也在有 `dist/` 时托管前端并做 SPA 回退 |

**选型结论：全栈 Node 托管（Render），不能用纯静态托管。**

- 纯静态托管（含此前的 CloudStudio 沙箱）**没有 Node 进程**，因此 `/api/submissions`、`/api/analyze` 全部不可用，必然退化成"演示模式"，无法满足"手机完整使用所有功能"。
- 项目已满足全栈托管的三个前提：`PORT` 读环境变量、有 `/health` 健康检查、`npm start` 单命令启动。

**平台对比**

| 平台 | 后端 | SQLite 持久化 | 免费 | 结论 |
| --- | --- | --- | --- | --- |
| **Render**（推荐） | ✅ Node 常驻 | 免费层为临时盘，可挂 Disk 升级 | ✅ 有免费层 | 选定 |
| Vercel / Netlify | 仅 Serverless 函数 | ❌ 无持久文件系统 | ✅ | 不选：SQLite 与文件归档不可用 |
| Railway / Fly.io | ✅ | ✅ 需绑卡 | 试用额度 | 备选 |
| 内网穿透（ngrok 等） | ✅ | ✅ | 部分 | 不选：链接短时效且依赖本机电 |

---

## 二、部署步骤

### 第 1 步：把代码推送到 GitHub

```bash
cd D:/projects/teacher-workbench

# 1) 在 GitHub 新建一个空仓库（不要初始化 README/.gitignore），复制其地址
# 2) 添加远程（两种任选其一）
git remote add origin https://github.com/你的用户名/teacher-workbench.git   # HTTPS
git remote add origin git@github.com:你的用户名/teacher-workbench.git       # SSH（本机已配 SSH key 时更省事）

# 3) 推送（HTTPS 方式：用户名填 GitHub 账号，密码处填 Personal Access Token，需 repo 权限）
git push -u origin master
```

> 仓库内 `.gitignore` 已忽略 `.env`、上传文件与数据库，**AI 密钥不会入库**。

### 第 2 步：在 Render 上创建服务

1. 登录 <https://dashboard.render.com> → **New** → **Blueprint**（或 Web Service）。
2. 授权并选择刚推送的仓库；Render 会自动读取仓库根目录的 `render.yaml`，构建/启动/健康检查**无需手填**。
3. 在 **Environment** 中确认/填写：
   - `AI_API_KEY` = 你的智谱密钥（`sync: false`，必须在此手动填，不能写进仓库）
   - 其余（`NODE_VERSION`、`AI_MODEL`、`AI_API_BASE`、`TWB_DATA_DIR`、`TWB_UPLOADS_DIR`）已由蓝图带出默认值。
4. 点 **Create** → 等待构建完成（首次约 2–4 分钟，需编译 `better-sqlite3`）。

### 第 3 步：拿到正式网址

Render 会分配 `https://teacher-workbench-xxxx.onrender.com`（HTTPS 自动签发，无需配置）。
推送到 `master` 后 `autoDeploy: true` 会自动重新构建发布。

---

## 三、配置文件清单（新增 / 修改）

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `render.yaml` | 已完善 | 构建 `npm install && npm run build`、启动 `npm start`、健康检查 `/health`、`autoDeploy`、环境变量（含 `AI_API_KEY` 手动填） |
| `server.js` | 已修改 | `UPLOADS_DIR` 改为可用 `TWB_UPLOADS_DIR` 覆盖并自动建目录（本地行为不变），便于云端挂持久化盘 |
| `server/db.js` | 既有 | 数据目录已支持 `TWB_DATA_DIR` 覆盖 |
| `.env.example` | 既有 | 本地环境变量模板；**云端不使用 `.env`，改在 Render Environment 配置** |
| `.gitignore` | 既有 | 已忽略 `.env`、`uploads/`、`data/`，保证密钥与用户数据不入库 |
| `package.json` | 既有 | `start` = `node --env-file-if-exists=.env server.js`；缺 `AI_API_KEY` 时启动即以非零码退出并给出指引 |

---

## 四、手机端验证方法

1. **页面加载**：手机浏览器打开正式网址，应看到登录页，标题「学校教研组工作台」；断掉电脑/关闭 IDE 后仍可打开。
2. **接口与后端在线**：手机访问 `https://你的域名/health`，应返回
   `{"ok":true,"model":"glm-4-flash","configured":true}`。
   若 `configured` 为 `false`，说明 `AI_API_KEY` 未生效，去 Render → Environment 补填并重启。
3. **完整功能链路**：登录后依次验证
   - 「成果上传」上传一份资料 → 「资料库」立即出现该记录（说明后端与 SQLite 正常，非演示模式）；
   - 资料库中点「预览」能在线打开、点「下载」能保存文件；
   - 「资料分析」选一份资料运行分析，返回六段式报告（概览/分维诊断/亮点/问题/建议/可视化），说明 AI 模型在云端调用成功。
4. **响应式显示**：手机竖屏下菜单可展开、表格不溢出；分别在 Safari/Chrome 与微信内置浏览器中打开确认。

---

## 五、后续更新发布

```bash
cd D:/projects/teacher-workbench
git add -A
git commit -m "说明本次改动"
git push origin master     # Render 检测到 master 变动，自动重新构建并发布
```

- 回滚：Render → 服务 → **Deploys** → 选择历史版本 **Redeploy**。
- 改环境变量：Render → **Environment** → 修改后服务会自动重启。
- 查看日志：Render → **Logs**（启动失败多因 `AI_API_KEY` 缺失或原生模块编译失败）。

---

## 六、需知的限制

- **免费层休眠**：约 15 分钟无访问会休眠，下次访问有约 30 秒冷启动，属正常现象，不影响 7×24 可用性。
- **免费层磁盘为临时盘**：重新部署或实例重建会清空 SQLite 与上传文件。
  需要数据长期留存时：升级 Starter 并挂载 Render Disk，然后把 `TWB_DATA_DIR` 设为 `/var/data/data`、`TWB_UPLOADS_DIR` 设为 `/var/data/uploads`（`render.yaml` 内已注明）。
- **真实 AI 分析依赖 `AI_API_KEY` 配额**：密钥欠费或限流时，分析会走分类错误提示（超时/网络/服务异常），不会静默伪装成演示数据。
