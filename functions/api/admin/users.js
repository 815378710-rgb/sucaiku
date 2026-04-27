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

export async function onRequestDelete(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);

  // 检查用户是否有进行中的订单
  const { data: activeOrders } = await supabase.from('orders').select('id')
    .eq('user_id', params.id).in('status', ['accepted', 'submitted']);
  if (activeOrders && activeOrders.length > 0) {
    return Response.json({ success: false, message: '该用户还有 ' + activeOrders.length + ' 个进行中的订单，请先处理' }, { status: 400 });
  }

  await supabase.from('users').delete().eq('id', params.id);
  return Response.json({ success: true, message: '已删除' });
}
