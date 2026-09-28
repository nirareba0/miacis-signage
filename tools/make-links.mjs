#!/usr/bin/env node
// スタッフ用・表示端末用の「鍵つき URL」を作る。本人が自分の Mac で実行する（鍵は画面に出るだけで、どこにも保存しない）。
//   node tools/make-links.mjs [公開URL]   既定: https://nirareba0.github.io/miacis-signage/
// 出た「鍵」を Supabase の共用アカウントのパスワードにする。URL を作り直したら古い URL は使えなくなる。
import { randomBytes } from 'node:crypto';

const base = (process.argv[2] || 'https://nirareba0.github.io/miacis-signage/').replace(/\/?$/, '/');
const key = () => randomBytes(18).toString('base64url'); // 24文字
const staff = key();
const display = key();

console.log(`
1. Supabase → Authentication → Users（無ければ Add user → Create new user、Auto Confirm User にチェック）
   staff@signage.miacis.example   のパスワード: ${staff}
   display@signage.miacis.example のパスワード: ${display}
   （もうある場合はユーザーを開いてパスワードを変え、tools/sql/change-passphrase.sql を流す）

2. 初めてのときだけ tools/sql/setup-accounts.sql を SQL Editor で流す（作って24時間以内）

3. URL を配る
   スタッフ用（LINE などでスタッフに）:
     ${base}admin.html#k=${staff}
   館のタブレット用（キオスクの起動 URL に。縦置きで OS が回せないときは #k= の前に ?rotate=90）:
     ${base}index.html#k=${display}
${base.startsWith('http://127.0.0.1') ? '' : `\n手元で試すときは、同じ URL の ${base} を http://127.0.0.1:8766/ に替えて開く。\n`}`);
