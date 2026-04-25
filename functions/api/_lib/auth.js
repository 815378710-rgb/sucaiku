// functions/api/_lib/auth.js
import { getSupabase } from './supabase.js';

export async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw + 'sucaiku_v2_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function adminAuth(request, env) {
  const token = request.headers.get('x-admin-token');
  if (!token) return null;
  const supabase = getSupabase(env);
  const { data } = await supabase.from('admin_tokens').select('*').eq('token', token).gt('expires_at', new Date().toISOString()).single();
  return data ? true : null;
}
