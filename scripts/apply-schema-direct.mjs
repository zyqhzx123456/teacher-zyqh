#!/usr/bin/env node
// 通过 Postgres 直连一次性完成云端初始化：建表 + RLS + Storage 桶 + 激活测试账号。
//
// 用法（密码只作为参数传入，不写入任何文件）：
//   node scripts/apply-schema-direct.mjs "<数据库密码>"
// 可选环境变量：
//   DB_HOST（默认 db.<项目引用>.supabase.co）、DB_PORT（默认 5432）
//   DB_USER（默认 postgres）、DB_NAME（默认 postgres）、DB_REF（项目引用）
//   CONFIRM_EMAIL（可选：需要直接激活的邮箱，默认 twb_test_20261007@school.com）
//
// 说明：本脚本只使用你显式提供的密码建立连接，连接关闭后不保留任何凭据。
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const password = process.argv[2]
if (!password) {
  console.error('\n用法：node scripts/apply-schema-direct.mjs "<数据库密码>"\n')
  process.exit(1)
}

const REF = process.env.DB_REF || 'mvklnvvdvmklgixafnvw'
const config = {
  host: process.env.DB_HOST || `db.${REF}.supabase.co`,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password,
  database: process.env.DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
}

// 按分号拆分语句，跳过 $$ 函数体内部的分号
function splitStatements(sql) {
  const out = []
  let buf = ''
  let inDollar = false
  let i = 0
  while (i < sql.length) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar
      buf += '$$'
      i += 2
      continue
    }
    const ch = sql[i]
    if (!inDollar && ch === ';') {
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
      i += 1
      continue
    }
    buf += ch
    i += 1
  }
  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

const confirmEmail = process.env.CONFIRM_EMAIL || 'twb_test_20261007@school.com'

async function main() {
  const client = new pg.Client(config)
  await client.connect()
  console.log(`已连接：${config.host}:${config.port}/${config.database}`)

  const sqlPath = path.resolve(process.cwd(), 'supabase', 'schema.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const statements = splitStatements(sql)
  console.log(`开始执行 schema.sql（共 ${statements.length} 条语句）…`)

  let ok = 0
  const failures = []
  for (const [idx, st] of statements.entries()) {
    const label = st.split('\n')[0].slice(0, 60).replace(/\s+/g, ' ')
    try {
      await client.query(st)
      ok += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failures.push(`#${idx + 1} [${label}] → ${msg}`)
    }
  }
  console.log(`schema.sql：成功 ${ok} 条，失败 ${failures.length} 条`)
  failures.forEach((f) => console.log('  ✗ ' + f))

  // 激活测试账号，免去邮箱确认（仅对指定邮箱生效，不改全局设置）
  try {
    const r = await client.query('update auth.users set email_confirmed_at = now() where email = $1 returning id', [
      confirmEmail,
    ])
    console.log(`激活测试账号 ${confirmEmail}：${r.rowCount ? '成功（可立即登录）' : '未找到该用户'}`)
  } catch (e) {
    console.log(`激活测试账号失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // 校验结果
  const t = await client.query(
    "select table_name from information_schema.tables where table_schema='public' and table_name in ('profiles','submissions','analysis_results')",
  )
  console.log('已建表：', t.rows.map((r) => r.table_name).join(', ') || '(无)')
  const b = await client.query("select id, public from storage.buckets where id='submissions'")
  console.log('Storage 桶：', b.rows.length ? `submissions（私有=${!b.rows[0].public}）` : '(未创建)')

  await client.end()
}

main().catch((e) => {
  console.error('执行失败：', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
