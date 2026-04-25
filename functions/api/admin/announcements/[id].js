// functions/api/admin/announcements/[id].js
import { getSupabase } from '../../_lib/supabase.js';
import { adminAuth } from '../../_lib/auth.js';

export async function onRequestDelete(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  await supabase.from('announcements').delete().eq('id', params.id);
  return Response.json({ success: true, message: '已删除' });
}
