// URL に埋め込んだ鍵（…/admin.html#k=xxxx）を読む。# より後ろはブラウザがサーバーへ送らないので、
// GitHub Pages のアクセス記録にも Supabase にも残らない。鍵＝共用アカウントのパスワード。

/** location.hash から鍵を取り出す。無い・短すぎるときは null。 */
export function readLinkKey(hash) {
  const raw = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('k');
  if (!raw) return null;
  const key = raw.trim();
  return key.length >= 12 ? key : null; // 12文字未満は鍵として作っていない（打ち間違い・切れた URL）
}
