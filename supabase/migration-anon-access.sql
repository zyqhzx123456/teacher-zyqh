-- ============================================================
-- 免登录改造：移除账号体系后，云端数据改为公开共享访问
-- 执行方式：node scripts/run-sql.mjs supabase/migration-anon-access.sql "<数据库密码>"
-- 说明：本脚本可重复执行
-- ============================================================

-- ---------- 1. 资料表：不再按用户隔离 ----------
alter table public.submissions alter column user_id drop not null;

drop policy if exists submissions_select_own on public.submissions;
drop policy if exists submissions_insert_own on public.submissions;
drop policy if exists submissions_update_own on public.submissions;
drop policy if exists submissions_delete_own on public.submissions;
drop policy if exists submissions_public_select on public.submissions;
drop policy if exists submissions_public_insert on public.submissions;
drop policy if exists submissions_public_update on public.submissions;
drop policy if exists submissions_public_delete on public.submissions;

create policy submissions_public_select on public.submissions for select using (true);
create policy submissions_public_insert on public.submissions for insert with check (true);
create policy submissions_public_update on public.submissions for update using (true) with check (true);
create policy submissions_public_delete on public.submissions for delete using (true);

-- ---------- 2. 分析结果表 ----------
alter table public.analysis_results alter column user_id drop not null;

drop policy if exists analysis_results_select_own on public.analysis_results;
drop policy if exists analysis_results_insert_own on public.analysis_results;
drop policy if exists analysis_results_update_own on public.analysis_results;
drop policy if exists analysis_results_delete_own on public.analysis_results;
drop policy if exists analysis_results_public_select on public.analysis_results;
drop policy if exists analysis_results_public_insert on public.analysis_results;
drop policy if exists analysis_results_public_update on public.analysis_results;
drop policy if exists analysis_results_public_delete on public.analysis_results;

create policy analysis_results_public_select on public.analysis_results for select using (true);
create policy analysis_results_public_insert on public.analysis_results for insert with check (true);
create policy analysis_results_public_update on public.analysis_results for update using (true) with check (true);
create policy analysis_results_public_delete on public.analysis_results for delete using (true);

-- ---------- 3. 档案表：角色改由前端固定，表保留但不再按用户隔离 ----------
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;
drop policy if exists profiles_public_select on public.profiles;

create policy profiles_public_select on public.profiles for select using (true);

-- ---------- 4. 移除注册建档触发器（不再有注册流程） ----------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ---------- 5. Storage 对象：允许匿名访问私有桶内的资料 ----------
drop policy if exists submissions_objects_select_own on storage.objects;
drop policy if exists submissions_objects_insert_own on storage.objects;
drop policy if exists submissions_objects_update_own on storage.objects;
drop policy if exists submissions_objects_delete_own on storage.objects;
drop policy if exists submissions_objects_public_select on storage.objects;
drop policy if exists submissions_objects_public_insert on storage.objects;
drop policy if exists submissions_objects_public_update on storage.objects;
drop policy if exists submissions_objects_public_delete on storage.objects;

create policy submissions_objects_public_select on storage.objects
  for select using (bucket_id = 'submissions');
create policy submissions_objects_public_insert on storage.objects
  for insert with check (bucket_id = 'submissions');
create policy submissions_objects_public_update on storage.objects
  for update using (bucket_id = 'submissions') with check (bucket_id = 'submissions');
create policy submissions_objects_public_delete on storage.objects
  for delete using (bucket_id = 'submissions');
