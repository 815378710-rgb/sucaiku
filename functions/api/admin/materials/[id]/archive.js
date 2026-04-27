// functions/api/admin/materials/[id]/archive.js
import { getSupabase } from '../../../_lib/supabase.js';
import { adminAuth } from '../../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);

  // 归档前检查是否有进行中的订单
  const { data: activeOrders } = await supabase.from('orders').select('id')
    .eq('material_id', params.id).in('status', ['accepted', 'submitted']);
  if (activeOrders && activeOrders.length > 0) {
    return Response.json({ success: false, message: '该素材还有 ' + activeOrders.length + ' 个进行中的订单，请先处理' }, { status: 400 });
  }

  await supabase.from('materials').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', params.id);
  return Response.json({ success: true, message: '已归档~' });
}
