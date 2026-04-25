// functions/api/admin/materials/[id]/archive.js
import { getSupabase } from '../../../_lib/supabase.js';
import { adminAuth } from '../../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  await supabase.from('materials').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', params.id);
  return Response.json({ success: true, message: '已归档~' });
}
