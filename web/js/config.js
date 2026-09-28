export const SUPABASE_URL = 'https://aljlbxvucscmpbcuccin.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsamxieHZ1Y3NjbXBiY3VjY2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjI3NjgsImV4cCI6MjEwNTg5ODc2OH0.vOztp7iBU5ylXyj6hPtBe7E3WmIrlGMszO5P3-Sb27U';

// 合言葉のログインの裏にある共用アカウント（メールは画面に出さない。合言葉＝このアカウントのパスワード）。
// スタッフ全員で1つ・表示端末で1つ。英単語バトルのプレイヤー（@players.miacis-vocab.example）とは別のドメインにしてある
export const SIGNAGE_STAFF_EMAIL = 'staff@signage.miacis.example';
export const SIGNAGE_DISPLAY_EMAIL = 'display@signage.miacis.example';

export function isConfigured() {
  return (
    Boolean(SUPABASE_URL) &&
    SUPABASE_URL !== '__SUPABASE_URL__' &&
    SUPABASE_URL.trim() !== '' &&
    Boolean(SUPABASE_ANON_KEY) &&
    SUPABASE_ANON_KEY !== '__ANON_KEY__' &&
    SUPABASE_ANON_KEY.trim() !== ''
  );
}
