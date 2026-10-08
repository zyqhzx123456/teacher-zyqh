// 资料提交元数据存储层（SQLite / better-sqlite3）
// 仅负责建表、索引与增删查；文件落盘在 submit.js。
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, process.env.TWB_DATA_DIR || 'data')
const DB_PATH = path.join(DATA_DIR, 'submit.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL') // 写性能 + 并发友好

db.exec(`
CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  orig_name   TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  hash        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  ip          TEXT,
  ua          TEXT,
  tags        TEXT,
  class_name  TEXT,
  course      TEXT,
  student_name TEXT,
  role        TEXT,
  uploader    TEXT,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'received'
);
`)

// 兼容旧库：若已有 submissions 表但缺少新列，先补列，再建索引（避免索引建在尚不存在的列上）
const existingCols = new Set(
  db.prepare('PRAGMA table_info(submissions)').all().map((c) => c.name),
)
const COLUMN_ADDS = [
  ['class_name', 'TEXT'],
  ['course', 'TEXT'],
  ['student_name', 'TEXT'],
  ['role', 'TEXT'],
  ['uploader', 'TEXT'],
]
for (const [col, type] of COLUMN_ADDS) {
  if (!existingCols.has(col)) {
    db.prepare(`ALTER TABLE submissions ADD COLUMN ${col} ${type}`).run()
  }
}

// 清理废弃的「联系方式」列：历史库可能仍带 contact 列，且建有 idx_sub_contact 索引。
// SQLite 不允许在索引仍引用该列时 DROP COLUMN，必须先删索引再删列。
if (existingCols.has('contact')) {
  try {
    db.exec('DROP INDEX IF EXISTS idx_sub_contact')
    db.prepare('ALTER TABLE submissions DROP COLUMN contact').run()
  } catch (e) {
    console.warn('[teacher-workbench] 删除 contact 列失败（可忽略）：', String(e))
  }
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_sub_type    ON submissions(type);
CREATE INDEX IF NOT EXISTS idx_sub_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_sub_name    ON submissions(name);
CREATE INDEX IF NOT EXISTS idx_sub_hash    ON submissions(hash);
CREATE INDEX IF NOT EXISTS idx_sub_class   ON submissions(class_name);
CREATE INDEX IF NOT EXISTS idx_sub_course  ON submissions(course);
CREATE INDEX IF NOT EXISTS idx_sub_type_time ON submissions(type, created_at);
`)

/** 插入一条提交记录，返回完整行 */
export function insertSubmission(row) {
  const cols = [
    'id', 'name', 'type', 'orig_name', 'stored_path',
    'hash', 'size', 'mime', 'ip', 'ua', 'tags', 'class_name', 'course',
    'student_name', 'role', 'uploader', 'created_at', 'status',
  ]
  const placeholders = cols.map((c) => `@${c}`).join(', ')
  db.prepare(`INSERT INTO submissions (${cols.join(', ')}) VALUES (${placeholders})`).run(row)
  return row
}

/** 幂等去重：相同 type + 文件哈希 + 提交人 视为同一份资料（联系方式已改为可选） */
export function findByHash(type, hash, uploader) {
  return db
    .prepare("SELECT * FROM submissions WHERE type = ? AND hash = ? AND COALESCE(uploader, '') = ? LIMIT 1")
    .get(type, hash, uploader || '')
}

/** 按 id 取单条（下载/删除用） */
export function getSubmission(id) {
  return db.prepare('SELECT * FROM submissions WHERE id = ? LIMIT 1').get(id)
}

/** 删除单条，返回被删行（便于清理磁盘文件） */
export function deleteSubmission(id) {
  const row = getSubmission(id)
  if (!row) return null
  db.prepare('DELETE FROM submissions WHERE id = ?').run(id)
  return row
}

/** 检索（资料类型 / 班级 / 课程 / 学生 / 上传人 / 时间范围 / 关键词 / 分页） */
export function querySubmissions({
  type,
  class_name,
  course,
  student,
  uploader,
  from,
  to,
  q,
  page = 1,
  size = 20,
} = {}) {
  const where = []
  const params = {}
  if (type) {
    where.push('type = @type')
    params.type = type
  }
  if (class_name) {
    where.push('class_name = @class_name')
    params.class_name = class_name
  }
  if (course) {
    where.push('course = @course')
    params.course = course
  }
  if (student) {
    where.push('student_name = @student')
    params.student = student
  }
  if (uploader) {
    where.push('uploader LIKE @uploader')
    params.uploader = `%${uploader}%`
  }
  if (from) {
    where.push('created_at >= @from')
    params.from = from
  }
  if (to) {
    where.push('created_at <= @to')
    params.to = to
  }
  if (q) {
    where.push(
      '(name LIKE @q OR orig_name LIKE @q OR tags LIKE @q OR class_name LIKE @q OR course LIKE @q OR student_name LIKE @q OR uploader LIKE @q)',
    )
    params.q = `%${q}%`
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM submissions ${clause}`).get(params).n
  const list = db
    .prepare(
      `SELECT * FROM submissions ${clause} ORDER BY created_at DESC LIMIT @size OFFSET @offset`,
    )
    .all({ ...params, size, offset: (page - 1) * size })
  return { list, total }
}

export default db
