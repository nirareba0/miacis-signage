#!/usr/bin/env bash
# 本番の Supabase（英単語バトルと同居: aljlbxvucscmpbcuccin）にサイネージの DB とストレージを入れる。
# 本人が自分の Mac で実行する（Supabase CLI はログイン済みが前提）。何度実行してもよい。
#
# db push は使わない。同居先（英単語バトル）の migration 履歴とぶつかるため、SQL をそのまま流す。
# 流すのは signage_ で始まるものだけ。英単語バトルの表・関数・権限には触らない（前後で権限の指紋を比べて確かめる）。
set -euo pipefail
cd "$(dirname "$0")/.."
REF=aljlbxvucscmpbcuccin
CLI=(npx --yes supabase@2.117.0)

FINGERPRINT="select
  (select md5(string_agg(grantee||':'||table_name||':'||privilege_type, ',' order by grantee, table_name, privilege_type))
     from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated') and table_name not like 'signage_%') as vocab_grants,
  (select md5(string_agg(p.proname||':'||array_to_string(coalesce(p.proacl,'{}'),';'), ',' order by p.proname))
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname not like 'signage_%') as vocab_functions"

fp() { "${CLI[@]}" db query --linked --project-ref "$REF" "$FINGERPRINT" 2>/dev/null | grep -oE '"vocab_[a-z]+": "[0-9a-f]+"' | sort; }

echo "1/3 英単語バトル側の権限を控える"
BEFORE="$(fp)"
[ -n "$BEFORE" ] || { echo "  控えを取れませんでした（npx supabase login を確かめてください）"; exit 1; }

echo "2/3 サイネージの表・権限・ストレージを入れる"
"${CLI[@]}" db query --linked --project-ref "$REF" -f supabase/migrations/0001_signage.sql >/dev/null

echo "3/3 英単語バトル側が変わっていないか比べる"
AFTER="$(fp)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "  変わっていません"
else
  echo "  !! 英単語バトル側の権限が変わりました。Claude に知らせてください"
  echo "  前: $BEFORE"
  echo "  後: $AFTER"
  exit 1
fi
echo "完了。次は Authentication → Users でアカウントを作り、tools/sql/setup-accounts.sql を SQL Editor で流す（README §1 ステップ3・4）"
