# AGENTS.md — miacis-signage の実装規約

韮崎市の中高生の居場所「青少年育成プラザ Miacis」の館内モニター用サイネージ。
スタッフが画像・動画を「開始日〜終了日」付きで載せ、館のタブレットPCが全画面で繰り返し流す。
仕様の正本は AIOS 側 `~/AIOS/core/projects/miacis/specs/signage-20260928.md`。このファイルは実装の規約だけを持つ。

## 構成

| 場所 | 中身 |
|---|---|
| `web/index.html` + `web/js/display.js` | 表示ページ（館のタブレットPCで全画面） |
| `web/admin.html` + `web/js/admin.js` | 管理ページ（スタッフがスマホ/PCから載せる） |
| `web/js/schedule.js` | 「今日なにを流すか」の規則。純粋関数だけ。**本人が書く部分がある（pickSlides）。触らない** |
| `web/js/config.js` | Supabase の URL と anon key（公開鍵）。未設定なら `__ANON_KEY__` |
| `supabase/migrations/` | テーブル・RLS・ストレージのポリシー（番号順に適用する素の SQL） |
| `tests/db/` | PGlite で migrations を流して権限と RLS を検査する |
| `web/tests/` | 画面側の純粋なロジックの検査 |
| `tools/sql/` | 本人が SQL Editor に貼る運用 SQL（スタッフの追加など） |

## 守ること

- **既存の Supabase に同居しても壊さない。** 英単語バトルと同じプロジェクトに入る可能性がある。
  テーブル・関数・ポリシーはすべて `signage_` で始める。`revoke all on all tables in schema public` のような
  **スキーマ全体への REVOKE / GRANT を書かない**。自分のテーブルと関数だけを名前で REVOKE → GRANT する
- 権限は「全部取り消してから要るものだけ許す」。Supabase は public のテーブル・関数を既定で anon/authenticated に全部許すので、
  自分のテーブル・関数は必ず名前で revoke してから grant する。テスト（`tests/db/helper.mjs`）はこの既定を再現している
- **読める・書けるのは `signage_members` に載っている人だけ。** `authenticated` であること自体は何の許可にもならない
  （同居先では中高生もログインユーザー）。anon には何も許さない
- ストレージのバケット `signage` は非公開。読むのは member、書く・消すのは editor
- 時刻の区切りは日本時間（`Asia/Tokyo`）。日付は 'YYYY-MM-DD'。終了日はその日を含む
- 画面の文字は日本語。ビルドなし・素の ES Modules。`supabase-js` は `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`
- 秘密情報（service_role key、DB パスワード）をリポジトリに書かない
- テストは `npm test` で全部通ること。テストファイルは必ず `*.test.mjs`
- **git commit / git push をしない。** 指示にないファイルを編集しない
