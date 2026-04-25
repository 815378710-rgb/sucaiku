// functions/api/materials/[id]/accept.js
import { getSupabase } from '../../_lib/supabase.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const userId = body?.userId;

  if (!userId) return Response.json({ success: false, message: '请先设置昵称~' }, { status: 400 });

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  if (!user) return Response.json({ success: false, message: '用户不存在' }, { status: 400 });

  const { data: material } = await supabase.from('materials').select('*').eq('id', params.id).single();
  if (!material) return Response.json({ success: false, message: '素材不存在' }, { status: 404 });
  if (material.status !== 'active') return Response.json({ success: false, message: '素材已下架' }, { status: 400 });
  if (material.expire_at && new Date(material.expire_at) <= new Date()) {
    return Response.json({ success: false, message: '素材已过期' }, { status: 400 });
  }
  if (material.current_orders >= material.max_orders) {
    return Response.json({ success: false, message: '手慢啦，接单已满~' }, { status: 400 });
  }

  const { data: existing } = await supabase.from('orders').select('id')
    .eq('material_id', params.id).eq('user_id', userId).neq('status', 'rejected').limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ success: false, message: '你已经接过这个素材啦~' }, { status: 400 });
  }

  const orderId = crypto.randomUUID();
  await supabase.from('orders').insert({
    id: orderId, material_id: params.id, user_id: userId,
    material_title: material.title, platform: material.platform,
    reward: material.reward, status: 'accepted'
  });
  await supabase.from('materials').update({
    current_orders: material.current_orders + 1, updated_at: new Date().toISOString()
  }).eq('id', params.id);
  await supabase.from('users').update({
    total_orders: user.total_orders + 1, last_active_at: new Date().toISOString()
  }).eq('id', userId);

  return Response.json({ success: true, message: '接单成功~', data: { orderId } });
}
