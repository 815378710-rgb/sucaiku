// functions/api/admin/orders/[id]/review.js
import { getSupabase } from '../../../_lib/supabase.js';
import { adminAuth } from '../../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const body = await request.json();
  const { action, note } = body || {};

  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();
  if (!order) return Response.json({ success: false, message: '订单不存在' }, { status: 404 });
  if (order.status !== 'submitted') return Response.json({ success: false, message: '只能审核已提交的订单' }, { status: 400 });

  if (action === 'approve') {
    // 使用状态条件更新，防止重复审核
    const { data: updated, error } = await supabase.from('orders').update({
      status: 'approved', reviewed_at: new Date().toISOString(), review_note: note || ''
    }).eq('id', params.id).eq('status', 'submitted').select();
    if (!updated || updated.length === 0) {
      return Response.json({ success: false, message: '订单状态已变更，请刷新' }, { status: 400 });
    }
    // 使用原子递增更新用户统计，防止并发时数据不一致
    await supabase.from('users').update({
      completed_orders: supabase.raw('completed_orders + 1'),
      total_earned: supabase.raw('total_earned + ' + (order.reward || 0))
    }).eq('id', order.user_id);
    return Response.json({ success: true, message: '已通过~' });
  }

  if (action === 'reject') {
    const { data: updated } = await supabase.from('orders').update({
      status: 'rejected', reviewed_at: new Date().toISOString(),
      review_note: note || '不符合要求，请修改后重新提交'
    }).eq('id', params.id).eq('status', 'submitted').select();
    if (!updated || updated.length === 0) {
      return Response.json({ success: false, message: '订单状态已变更，请刷新' }, { status: 400 });
    }
    // 使用原子递减，防止竞态导致 current_orders 变成负数
    await supabase.rpc('decrement_orders', { mat_id: order.material_id });
    return Response.json({ success: true, message: '已驳回' });
  }

  return Response.json({ success: false, message: '无效操作' }, { status: 400 });
}
