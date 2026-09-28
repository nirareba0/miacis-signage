-- tools/sql/change-passphrase.sql
-- 合言葉を変えたあと、いまログインしている端末を全部締め出す（スタッフが辞めたとき・合言葉が漏れたとき）。
--
-- 手順:
-- 1. Supabase Dashboard → Authentication → Users → staff@signage.miacis.example → パスワードを新しい合言葉に変える
-- 2. この SQL を SQL Editor に貼って RUN（表示端末の分も締め出すなら 2 行目の email も残す）
-- 3. 新しい合言葉をスタッフに伝える。締め出された端末は、遅くとも1時間で合言葉の画面に戻る
--
-- 表示端末（display）まで締め出すと、館のモニターも合言葉の画面で止まる。館で入れ直せるときだけにする。

delete from auth.sessions
where user_id in (
  select id from auth.users
  where email in (
    'staff@signage.miacis.example'
    -- , 'display@signage.miacis.example'
  )
);
