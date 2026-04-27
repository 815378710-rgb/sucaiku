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

  // 检查是否已接单（未被驳回的）
  const { data: existing } = await supabase.from('orders').select('id')
    .eq('material_id', params.id).eq('user_id', userId).neq('status', 'rejected').limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ success: false, message: '你已经接过这个素材啦~' }, { status: 400 });
  }

  // 使用数据库原子操作递增 current_orders，防止竞态超额接单
  // 先尝试原子递增，条件是 current_orders < max_orders
  const { data: updated, error: updateError } = await supabase.rpc('increment_orders', {
    mat_id: params.id
  });

  // 如果 RPC 不存在，回退到手动检查+更新
  if (updateError) {
    // 重新读取最新数据
    const { data: freshMat } = await supabase.from('materials').select('current_orders, max_orders').eq('id', params.id).single();
    if (!freshMat || freshMat.current_orders >= freshMat.max_orders) {
      return Response.json({ success: false, message: '手慢啦，接单已满~' }, { status: 400 });
    }
    const { error: updErr } = await supabase.from('materials').update({
      current_orders: freshMat.current_orders + 1, updated_at: new Date().toISOString()
    }).eq('id', params.id).eq('current_orders', freshMat.current_orders); // 乐观锁
    if (updErr) {
      return Response.json({ success: false, message: '手慢啦，接单已满~' }, { status: 400 });
    }
  } else if (updated === 0) {
    return Response.json({ success: false, message: '手慢啦，接单已满~' }, { status: 400 });
  }

  const orderId = crypto.randomUUID();
  try {
    await supabase.from('orders').insert({
      id: orderId, material_id: params.id, user_id: userId,
      material_title: material.title, platform: material.platform,
      reward: material.reward, status: 'accepted'
    });
  } catch (err) {
    // 回滚 current_orders，使用原子递减防止竞态
    try {
      await supabase.rpc('decrement_orders', { mat_id: params.id });
    } catch (rollbackErr) {
      console.error('回滚 current_orders 失败:', rollbackErr);
    }
    return Response.json({ success: false, message: '创建订单失败，请重试' }, { status: 500 });
  }
  // 使用原子递增更新用户统计，防止并发时数据不一致
  await supabase.rpc('increment_user_orders', { uid: userId });

  return Response.json({ success: true, message: '接单成功~', data: { orderId } });
}
