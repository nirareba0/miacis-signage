/**
 * supa.js - Supabase クライアントとサイネージ用データ・ストレージ操作関数
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';
export { SIGNAGE_STAFF_EMAIL, SIGNAGE_DISPLAY_EMAIL } from './config.js';

export { isConfigured };

// ログイン状態は英単語バトルと別の名前で覚える。どちらも nirareba0.github.io の下にあり、
// 既定の名前（sb-<ref>-auth-token）のままだと同じ端末でログインが混ざる
// （館のタブレットでスタッフがサイネージに入ると、次に英単語バトルを開いた中高生がスタッフになる）
export const AUTH_STORAGE_KEY = 'miacis-signage-auth';

export const supabase = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: AUTH_STORAGE_KEY } })
  : null;

function ensureClient() {
  if (!supabase) {
    throw new Error('config.js が未設定です');
  }
}

// 認証関連
export async function signIn(email, password) {
  ensureClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) throw new Error('合言葉が違います');
    if (/rate limit|too many/i.test(error.message)) throw new Error('続けて間違えたので少し待ってからもう一度入れてください');
    throw error;
  }
  return data;
}

export async function signOut() {
  ensureClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

export async function getRole() {
  if (!supabase) return null;
  // 通信の失敗は throw する。null（＝権限なし）と取り違えると、ネットが切れた朝に
  // 「権限がありません」の画面で止まってしまう
  const { data, error } = await supabase.rpc('signage_role');
  if (error) throw error;
  return data;
}

// スライドデータ
export async function fetchSlides() {
  ensureClient();
  const { data, error } = await supabase
    .from('signage_slides')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('starts_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertSlide(slideData) {
  ensureClient();
  const { data, error } = await supabase
    .from('signage_slides')
    .insert(slideData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSlide(id, patch) {
  ensureClient();
  const { data, error } = await supabase
    .from('signage_slides')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSlide(id) {
  ensureClient();
  const { error } = await supabase
    .from('signage_slides')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// メンバー一覧
export async function fetchMembers() {
  ensureClient();
  const { data, error } = await supabase
    .from('signage_members')
    .select('*');
  if (error) throw error;
  return data || [];
}

// ストレージ
export async function downloadBlob(storagePath) {
  ensureClient();
  const { data, error } = await supabase.storage.from('signage').download(storagePath);
  if (error) throw error;
  return data;
}

export async function createSignedUrl(storagePath, expiresIn = 3600) {
  ensureClient();
  const { data, error } = await supabase.storage.from('signage').createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl;
}

export async function uploadSlideFile(storagePath, fileOrBlob, contentType) {
  ensureClient();
  const options = { upsert: false };
  if (contentType) options.contentType = contentType;
  const { data, error } = await supabase.storage.from('signage').upload(storagePath, fileOrBlob, options);
  if (error) throw error;
  return data;
}

export async function deleteSlideFile(storagePath) {
  ensureClient();
  const { data, error } = await supabase.storage.from('signage').remove([storagePath]);
  if (error) throw error;
  return data;
}
