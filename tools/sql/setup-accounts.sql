-- tools/sql/setup-accounts.sql
-- 共用アカウント2つ（スタッフ・表示端末）にサイネージの権限を付ける。最初に1回だけ。
--
-- 手順（GitHub に公開する前にやる。公開すると共用アカウントのメールが web/js/config.js から読めるため）:
-- 1. Supabase Dashboard → Authentication → Users → 「Add user」→「Create new user」で2つ作る
--      staff@signage.miacis.example   パスワード = スタッフの合言葉（12文字以上。スタッフに伝える）
--      display@signage.miacis.example パスワード = 表示端末の合言葉（12文字以上。スタッフには伝えなくてよい）
--    「Auto Confirm User」にチェックを入れる
-- 2. この SQL を SQL Editor に貼って RUN
--
-- 作ってから24時間以内のユーザーにだけ権限を付ける。英単語バトルと同居していて誰でも新規登録できるので、
-- 誰かが先に同じメールで登録していた場合に、その人へスタッフの権限を渡さないため。
-- 最後の select で2行とも出れば完了。出ない行は「Add user」からやり直す（先に作られていたら Claude に相談）。

insert into public.signage_members (user_id, role, display_name)
select id, 'editor', 'スタッフ（共用）'
from auth.users
where email = 'staff@signage.miacis.example'
  and created_at > now() - interval '24 hours'
on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.signage_members (user_id, role, display_name)
select id, 'display', '館内モニター'
from auth.users
where email = 'display@signage.miacis.example'
  and created_at > now() - interval '24 hours'
on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;

select u.email, m.role, m.display_name, u.created_at
from public.signage_members m
join auth.users u on u.id = m.user_id
order by m.role;
