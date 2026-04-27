// functions/api/admin/orders/[id]/pay.js
import { getSupabase } from '../../../_lib/supabase.js';
import { adminAuth } from '../../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);

  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();
  if (!order) return Response.json({ success: false, message: '订单不存在' }, { status: 404 });
  if (order.status !== 'approved') return Response.json({ success: false, message: '只能标记已审核通过的订单' }, { status: 400 });

  // 使用条件更新防止重复打款
  const { data: updated } = await supabase.from('orders').update({
    status: 'paid', paid_at: new Date().toISOString()
  }).eq('id', params.id).eq('status', 'approved').select();
  if (!updated || updated.length === 0) {
    return Response.json({ success: false, message: '订单状态已变更，请刷新' }, { status: 400 });
  }
  return Response.json({ success: true, message: '已标记打款~' });
}
