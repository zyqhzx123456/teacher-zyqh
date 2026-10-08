#!/usr/bin/env node
// 通用 SQL 执行器（本机直连，密码仅作为命令行参数传入，不写入任何文件）
// 用法：node scripts/run-sql.mjs <sql文件路径> "<数据库密码>"
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const file = process.argv[2]
const password = process.argv[3]
if (!file || !password) {
  console.error('\n用法：node scripts/run-sql.mjs <sql文件路径> "<数据库密码>"\n')
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

async function main() {
  const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
  const client = new pg.Client(config)
  await client.connect()
  console.log(`已连接：${config.host}:${config.port}`)
  const statements = splitStatements(sql)
  let ok = 0
  const failures = []
  for (const [idx, st] of statements.entries()) {
    try {
      await client.query(st)
      ok += 1
    } catch (e) {
      failures.push(`#${idx + 1} [${st.split('\n')[0].slice(0, 50)}] → ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`执行完成：成功 ${ok} 条，失败 ${failures.length} 条`)
  failures.forEach((f) => console.log('  ✗ ' + f))
  await client.end()
}

main().catch((e) => {
  console.error('执行失败：', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
