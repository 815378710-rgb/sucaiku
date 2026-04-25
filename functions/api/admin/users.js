// functions/api/admin/users.js
import { getSupabase } from '../_lib/supabase.js';
import { adminAuth } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  return Response.json({ success: true, data: data || [] });
}
