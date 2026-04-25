// functions/api/admin/login.js
import { getSupabase } from '../_lib/supabase.js';
import { hashPassword, generateToken } from '../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const password = body?.password;
  if (!password) return Response.json({ success: false, message: '请输入密码' }, { status: 400 });

  const { data: config } = await supabase.from('site_config').select('value').eq('key', 'admin_password_hash').single();
  const storedHash = config ? config.value : '';
  const inputHash = await hashPassword(password);

  if (inputHash !== storedHash) {
    return Response.json({ success: false, message: '密码错误' }, { status: 401 });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('admin_tokens').insert({ token, expires_at: expiresAt });
  await supabase.from('admin_tokens').delete().lt('expires_at', new Date().toISOString());

  return Response.json({ success: true, token });
}
