-- 0002_open_ended.sql
-- 終了日を空にできるようにする。空（null）は「期限なし＝ずっと流す」（本人の指示 2026-09-28）。
-- 何度流してもよい。check (starts_on <= ends_on) は ends_on が null のとき満たされる扱いなので、そのまま残す。
alter table public.signage_slides alter column ends_on drop not null;
