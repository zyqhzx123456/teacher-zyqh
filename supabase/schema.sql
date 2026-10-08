-- ============================================================
-- 教研工作台 · Supabase 云端数据层
-- 执行方式：Supabase 后台 → SQL Editor → 粘贴全部内容 → Run
-- 本脚本可重复执行（大量使用 if not exists / drop ... if exists）
--
-- ⚠️ 注意：本项目现已移除账号登录，改为「免登录 + 匿名共享」。
--   本文件为「按用户隔离」的邮箱账号版架构，仅供历史参考；
--   实际线上生效的是 supabase/migration-anon-access.sql（公开共享访问）。
--   若需全新部署免登录架构，请以 migration-anon-access.sql 为准。
-- ============================================================

-- ---------- 1. 用户档案表 ----------
-- 与 auth.users 一对一，存放角色与所属教研组
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default '',
  role text not null default 'teacher' check (role in ('teacher', 'leader', 'admin', 'principal')),
  group_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 每个用户只能读写自己的档案
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = id);

-- ---------- 2. 资料表 ----------
-- 对应工作台「成果上传 / 资料库」中的一条资料
create table if not exists public.submissions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  type text not null default '',
  orig_name text not null default '',
  size bigint not null default 0,
  mime text not null default '',
  tags text not null default '',
  class_name text not null default '',
  course text not null default '',
  student_name text not null default '',
  uploader text not null default '',
  source text not null default 'file' check (source in ('file', 'url')),
  url text,                 -- 线上链接型资料的原始地址
  storage_path text,        -- 文件型资料在 Storage 中的路径（私有桶）
  status text not null default 'done',
  created_at timestamptz not null default now()
);

create index if not exists submissions_user_created_idx
  on public.submissions (user_id, created_at desc);
create index if not exists submissions_user_uploader_idx
  on public.submissions (user_id, uploader);

alter table public.submissions enable row level security;

-- 每个用户只能读取、新增、修改、删除自己的资料
drop policy if exists submissions_select_own on public.submissions;
create policy submissions_select_own on public.submissions
  for select using (auth.uid() = user_id);
drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions
  for insert with check (auth.uid() = user_id);
drop policy if exists submissions_update_own on public.submissions;
create policy submissions_update_own on public.submissions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists submissions_delete_own on public.submissions;
create policy submissions_delete_own on public.submissions
  for delete using (auth.uid() = user_id);

-- ---------- 3. 分析结果表 ----------
-- 存放「资料分析」的六段式结果，使分析结果同样跨端同步
create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_results_user_created_idx
  on public.analysis_results (user_id, created_at desc);
create index if not exists analysis_results_user_submission_idx
  on public.analysis_results (user_id, submission_id);

alter table public.analysis_results enable row level security;

drop policy if exists analysis_results_select_own on public.analysis_results;
create policy analysis_results_select_own on public.analysis_results
  for select using (auth.uid() = user_id);
drop policy if exists analysis_results_insert_own on public.analysis_results;
create policy analysis_results_insert_own on public.analysis_results
  for insert with check (auth.uid() = user_id);
drop policy if exists analysis_results_update_own on public.analysis_results;
create policy analysis_results_update_own on public.analysis_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists analysis_results_delete_own on public.analysis_results;
create policy analysis_results_delete_own on public.analysis_results
  for delete using (auth.uid() = user_id);

-- ---------- 4. 注册后自动建立档案 ----------
-- 新用户写入 auth.users 时，按其注册信息自动生成 profiles，
-- 避免首次登录后因缺少档案而回退成默认老师。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, group_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'teacher'),
    coalesce(new.raw_user_meta_data ->> 'group_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 5. 私有文件桶与对象策略 ----------
-- 资料归档桶：私有（public = false），只能凭签名链接或登录后按策略访问。
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

-- 对象路径约定：{用户ID}/{资料ID}/{文件名}
-- 因此「路径第一段等于自己的用户 ID」即等价于「自己的文件」。
drop policy if exists submissions_objects_select_own on storage.objects;
create policy submissions_objects_select_own on storage.objects
  for select using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists submissions_objects_insert_own on storage.objects;
create policy submissions_objects_insert_own on storage.objects
  for insert with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists submissions_objects_update_own on storage.objects;
create policy submissions_objects_update_own on storage.objects
  for update using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists submissions_objects_delete_own on storage.objects;
create policy submissions_objects_delete_own on storage.objects
  for delete using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
