#!/usr/bin/env node
// 一次性导入：把本机已有的历史资料（SQLite + uploads 归档）迁移到 Supabase。
//
// 用法（在项目根目录执行）：
//   1) 先在 Supabase SQL Editor 执行 supabase/schema.sql 建表与 RLS
//   2) 在 Storage 创建私有桶 submissions
//   3) 设置环境变量后运行：
//      Windows PowerShell:
//        $env:SUPABASE_URL="https://xxx.supabase.co"
//        $env:SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."      # 服务角色密钥，仅本地使用，切勿提交
//        $env:TARGET_EMAIL="teacher@school.com"            # 资料归属的登录邮箱
//        node scripts/import-to-supabase.mjs
//      Git Bash / macOS / Linux:
//        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TARGET_EMAIL=... node scripts/import-to-supabase.mjs
//
// 说明：本脚本用 service_role 密钥写入，可绕过 RLS 指定归属用户；
// 该密钥仅在你本机脚本中使用，绝不能写进前端代码或提交到仓库。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim()
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const TARGET_EMAIL = (process.env.TARGET_EMAIL || '').trim()
const BUCKET = 'submissions'

function fail(msg) {
  console.error(`\n[导入失败] ${msg}\n`)
  process.exit(1)
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  fail(
    '缺少环境变量。请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（服务角色密钥，从 Supabase 后台 → Project Settings → API 获取）。',
  )
}
if (!TARGET_EMAIL) {
  fail('缺少环境变量 TARGET_EMAIL：请指定这些历史资料归属哪个登录账号（该账号需已注册）。')
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// 1) 找到目标用户的 UUID
async function resolveUserId(email) {
  let page = 1
  const perPage = 200
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) fail(`查询用户列表失败：${error.message}`)
    const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if ((data?.users || []).length < perPage) break
    page += 1
  }
  fail(`未找到邮箱为 ${email} 的账号，请先在工作台注册该账号后再导入。`)
}

// 2) 读取本机历史资料
function readLocalRows() {
  const dbPath = path.resolve(process.cwd(), process.env.TWB_DATA_DIR || 'data', 'submit.db')
  if (!fs.existsSync(dbPath)) fail(`未找到本地数据库 ${dbPath}。若从未上传过资料，则无需导入。`)
  let Database
  try {
    Database = require('better-sqlite3')
  } catch {
    fail('无法加载 better-sqlite3，请先执行 npm install。')
  }
  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare('SELECT * FROM submissions').all()
  db.close()
  return rows
}

// 3) 定位归档文件的真实路径（历史 stored_path 可能是相对或绝对路径）
function resolveFile(storedPath, origName) {
  const candidates = [
    storedPath,
    path.resolve(process.cwd(), storedPath || ''),
    path.resolve(process.cwd(), 'uploads', storedPath || ''),
    path.resolve(process.cwd(), 'data', 'uploads', storedPath || ''),
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c
    } catch {
      /* 路径非法，继续尝试下一个 */
    }
  }
  // 兜底：uploads 下按原始文件名查找
  try {
    const dir = path.resolve(process.cwd(), 'uploads')
    if (fs.existsSync(dir) && origName) {
      const hit = fs.readdirSync(dir).find((f) => f === origName || f.includes(origName))
      if (hit) return path.join(dir, hit)
    }
  } catch {
    /* 忽略 */
  }
  return null
}

async function main() {
  const userId = await resolveUserId(TARGET_EMAIL)
  console.log(`目标账号：${TARGET_EMAIL}（${userId}）`)

  const rows = readLocalRows()
  console.log(`本机历史资料：${rows.length} 条`)

  let ok = 0
  let skipped = 0
  const failures = []

  for (const r of rows) {
    const id = String(r.id)
    try {
      const origName = r.orig_name || 'file'
      const localFile = resolveFile(r.stored_path, origName)
      let storagePath = null
      let source = 'file'
      let url = r.url || null

      if (localFile) {
        const safeName = origName.replace(/[\\/]/g, '_')
        storagePath = `${userId}/${id}/${safeName}`
        const body = fs.readFileSync(localFile)
        const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, {
          contentType: r.mime || 'application/octet-stream',
          upsert: true,
        })
        if (upErr) throw new Error(`文件上传失败：${upErr.message}`)
      } else if (url) {
        source = 'url'
      } else {
        skipped += 1
        failures.push(`${id}：找不到归档文件，已跳过（仅元数据也无链接）`)
        continue
      }

      const { error: dbErr } = await admin.from('submissions').upsert(
        {
          id,
          user_id: userId,
          name: r.name || '',
          type: r.type || '',
          orig_name: origName,
          size: Number(r.size || 0),
          mime: r.mime || '',
          tags: r.tags || '',
          class_name: r.class_name || '',
          course: r.course || '',
          student_name: r.student_name || '',
          uploader: r.uploader || '',
          source,
          url: source === 'url' ? url : null,
          storage_path: storagePath,
          status: r.status || 'done',
          created_at: r.created_at || new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (dbErr) throw new Error(`写入数据表失败：${dbErr.message}`)
      ok += 1
      process.stdout.write(`\r已导入 ${ok}/${rows.length}`)
    } catch (e) {
      failures.push(`${id}：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log('')
  console.log(`\n导入完成：成功 ${ok} 条，跳过 ${skipped} 条，失败 ${failures.length} 条`)
  if (failures.length) {
    console.log('失败明细：')
    failures.forEach((f) => console.log(`  - ${f}`))
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
