// functions/api/admin/login.js
import { getSupabase } from '../_lib/supabase.js';
import { hashPassword, generateToken } from '../_lib/auth.js';

// 简易内存速率限制（每个 Worker 实例独立，但足以防暴力破解）
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15分钟

function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  if (record.count >= MAX_ATTEMPTS) return false;
  record.count++;
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const password = body?.password;
  if (!password) return Response.json({ success: false, message: '请输入密码' }, { status: 400 });

  // 速率限制
  const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return Response.json({ success: false, message: '尝试次数过多，请15分钟后再试' }, { status: 429 });
  }

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
