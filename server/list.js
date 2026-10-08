// 资料检索 / 下载 / 删除（/api/submissions）
// GET  /          列表（按 类型/班级/课程/学生/上传人/时间/关键词 过滤 + 分页）
// GET  /:id/file  下载归档文件（权限：老师 / 教研组长 / 管理员 / 教研校长）
// DELETE /:id     删除记录 + 磁盘文件（权限：老师 / 教研组长 / 管理员 / 教研校长）
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { querySubmissions, getSubmission, deleteSubmission } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ALLOWED_ROLES = ['teacher', 'leader', 'admin', 'principal']

function isAllowedRole(role) {
  return Boolean(role) && ALLOWED_ROLES.includes(role)
}

const router = express.Router()

router.get('/', (req, res) => {
  // 缓存失效策略：列表为动态数据，禁止任何层（浏览器/代理/SW）缓存，保证多端读取始终最新
  res.set('Cache-Control', 'no-store')
  const { type, class_name, course, student, uploader, from, to, q, page, size } = req.query
  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20))
  try {
    const { list, total } = querySubmissions({
      type: typeof type === 'string' ? type : undefined,
      class_name: typeof class_name === 'string' ? class_name : undefined,
      course: typeof course === 'string' ? course : undefined,
      student: typeof student === 'string' ? student : undefined,
      uploader: typeof uploader === 'string' ? uploader : undefined,
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      q: typeof q === 'string' ? q : undefined,
      page: pageNum,
      size: sizeNum,
    })
    // 标记「已删除文件的残留引用」：记录存在但磁盘文件缺失，供前端提示并禁用下载
    const uploadsRoot = path.join(ROOT, 'uploads')
    const listWithFlag = list.map((r) => ({
      ...r,
      fileMissing:
        !fs.existsSync(path.join(ROOT, r.stored_path)) ||
        !path.join(ROOT, r.stored_path).startsWith(uploadsRoot),
    }))
    res.json({
      code: 0,
      message: 'ok',
      data: { list: listWithFlag, total, page: pageNum, size: sizeNum },
    })
  } catch (err) {
    console.error('[teacher-workbench] 检索失败：', String(err))
    res.json({ code: 500, message: '检索失败', data: null })
  }
})

// 下载归档文件（权限：老师 / 教研组长 / 管理员 / 教研校长）
router.get('/:id/file', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const role = req.query.role
  if (!isAllowedRole(role)) {
    return res.status(403).json({ code: 40301, message: '无下载权限：仅老师 / 教研组长 / 管理员 / 教研校长', data: null })
  }
  const row = getSubmission(req.params.id)
  if (!row) return res.status(404).json({ code: 404, message: '资料不存在', data: null })
  const abs = path.join(ROOT, row.stored_path)
  if (!fs.existsSync(abs)) return res.status(404).json({ code: 404, message: '文件已缺失', data: null })
  // 仅允许项目内 uploads 目录，防目录穿越
  const uploadsRoot = path.join(ROOT, 'uploads')
  if (!abs.startsWith(uploadsRoot)) return res.status(400).json({ code: 400, message: '非法路径', data: null })

  // 在线预览：inline=1 时以 inline 方式返回，浏览器内联显示（图片/PDF 等可直接预览）；
  // 否则走附件下载（res.download 默认 attachment）。
  if (req.query.inline === '1') {
    res.setHeader('Content-Type', row.mime || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.orig_name)}`,
    )
    return res.sendFile(abs)
  }
  res.download(abs, row.orig_name)
})

// 删除记录 + 磁盘文件（权限：老师 / 教研组长 / 管理员 / 教研校长）
router.delete('/:id', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const role = req.query.role || req.body?.role
  if (!isAllowedRole(role)) {
    return res.status(403).json({ code: 40301, message: '无删除权限：仅老师 / 教研组长 / 管理员 / 教研校长', data: null })
  }
  const row = getSubmission(req.params.id)
  if (!row) return res.status(404).json({ code: 404, message: '资料不存在', data: null })
  const abs = path.join(ROOT, row.stored_path)
  // 先删磁盘文件，成功后再删数据库记录：避免「记录已删、文件残留」的孤儿文件；
  // 若文件删除失败则保留记录（可重试），覆盖「清理过程中断」边界。
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch (e) {
    console.error('[teacher-workbench] 删除磁盘文件失败：', String(e))
    return res.status(500).json({ code: 500, message: '文件删除失败，记录已保留可重试', data: null })
  }
  deleteSubmission(req.params.id)
  res.json({ code: 0, message: '已删除', data: { id: req.params.id } })
})

export default router
