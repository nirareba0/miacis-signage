-- 0001_signage.sql
-- 何度流してもよい（本番へは supabase db query で流す。db push は同居先の migration 履歴とぶつかるので使わない）
-- Miacis 館内サイネージ用テーブル・RLS・ストレージ設定

-- 1. テーブル作成
create table if not exists public.signage_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'display')),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.signage_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null,
  starts_on date not null,
  ends_on date not null,
  duration_sec integer not null default 10 check (duration_sec between 3 and 60),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signage_slides_starts_on_le_ends_on check (starts_on <= ends_on)
);

-- updated_at を自動更新するトリガー
create or replace function public.signage_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists signage_slides_set_updated_at on public.signage_slides;
create trigger signage_slides_set_updated_at
  before update on public.signage_slides
  for each row
  execute function public.signage_set_updated_at();

-- 2. ロール判定関数 (security definer)
create or replace function public.signage_role()
returns text as $$
  select role from public.signage_members where user_id = auth.uid();
$$ language sql stable security definer set search_path = '';

-- 3. 権限管理 (自分のテーブル・関数だけ明示的に REVOKE -> GRANT)
-- スキーマ全体の REVOKE / GRANT は既存の同居アプリを壊すため絶対に書かない。
revoke all on table public.signage_members from anon, authenticated;
revoke all on table public.signage_slides from anon, authenticated;
revoke execute on function public.signage_role() from public, anon, authenticated;
revoke execute on function public.signage_set_updated_at() from public, anon, authenticated;

-- authenticated に必要な権限だけ付与（anon には何も与えない）
grant select on table public.signage_members to authenticated;
grant select, insert, update, delete on table public.signage_slides to authenticated;
grant execute on function public.signage_role() to authenticated;

-- 4. 行レベルセキュリティ (RLS)
alter table public.signage_members enable row level security;
alter table public.signage_slides enable row level security;

-- signage_members: メンバーのみ select 可能、書き込みはクライアントからは不可（SQL Editor からのみ）
drop policy if exists signage_members_select on public.signage_members;
create policy signage_members_select on public.signage_members
  for select to authenticated
  using (public.signage_role() is not null);

-- signage_slides: メンバーのみ select 可能、editor のみ insert / update / delete 可能
drop policy if exists signage_slides_select on public.signage_slides;
create policy signage_slides_select on public.signage_slides
  for select to authenticated
  using (public.signage_role() is not null);

drop policy if exists signage_slides_insert on public.signage_slides;
create policy signage_slides_insert on public.signage_slides
  for insert to authenticated
  with check (public.signage_role() = 'editor');

drop policy if exists signage_slides_update on public.signage_slides;
create policy signage_slides_update on public.signage_slides
  for update to authenticated
  using (public.signage_role() = 'editor')
  with check (public.signage_role() = 'editor');

drop policy if exists signage_slides_delete on public.signage_slides;
create policy signage_slides_delete on public.signage_slides
  for delete to authenticated
  using (public.signage_role() = 'editor');

-- 5. ストレージ設定
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signage',
  'signage',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- storage.objects のポリシー（bucket_id = 'signage' のみ対象）
drop policy if exists signage_storage_select on storage.objects;
create policy signage_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'signage' and public.signage_role() is not null);

drop policy if exists signage_storage_insert on storage.objects;
create policy signage_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signage' and public.signage_role() = 'editor');

drop policy if exists signage_storage_update on storage.objects;
create policy signage_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'signage' and public.signage_role() = 'editor')
  with check (bucket_id = 'signage' and public.signage_role() = 'editor');

drop policy if exists signage_storage_delete on storage.objects;
create policy signage_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'signage' and public.signage_role() = 'editor');
