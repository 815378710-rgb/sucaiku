// functions/api/admin/materials/[id].js
import { getSupabase } from '../../_lib/supabase.js';
import { adminAuth } from '../../_lib/auth.js';

export async function onRequestPut(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const body = await request.json();
  const { title, copyText, reward, maxOrders, tags } = body || {};
  const updates = { updated_at: new Date().toISOString() };

  if (title !== undefined) {
    if (!title.trim() || title.trim().length > 100) return Response.json({ success: false, message: '标题需在1-100字之间' }, { status: 400 });
    updates.title = title.trim();
  }
  if (copyText !== undefined) updates.copy_text = copyText.trim();
  if (reward !== undefined) {
    const r = parseFloat(reward);
    if (isNaN(r) || r <= 0) return Response.json({ success: false, message: '赏金必须大于0' }, { status: 400 });
    updates.reward = r;
  }
  if (maxOrders !== undefined) {
    const mo = parseInt(maxOrders);
    if (isNaN(mo) || mo < 1) return Response.json({ success: false, message: '最大接单数至少为1' }, { status: 400 });
    updates.max_orders = mo;
  }
  if (tags !== undefined) updates.tags = tags.split(',').map(t => t.trim()).filter(Boolean);

  await supabase.from('materials').update(updates).eq('id', params.id);
  return Response.json({ success: true });
}

export async function onRequestDelete(context) {
  const { request, params, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);

  const { data: activeOrders } = await supabase.from('orders').select('id')
    .eq('material_id', params.id).in('status', ['accepted', 'submitted']);
  if (activeOrders && activeOrders.length > 0) {
    return Response.json({ success: false, message: '该素材还有进行中的订单' }, { status: 400 });
  }
  await supabase.from('materials').delete().eq('id', params.id);
  return Response.json({ success: true, message: '已删除' });
}
