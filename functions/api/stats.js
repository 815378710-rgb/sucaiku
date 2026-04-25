// functions/api/stats.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { env } = context;
  const supabase = getSupabase(env);
  const now = new Date().toISOString();

  const { data: active } = await supabase.from('materials')
    .select('platform, reward, current_orders').eq('status', 'active')
    .or(`expire_at.is.null,expire_at.gt.${now}`);

  const materials = active || [];
  const totalMaterials = materials.length;
  const xiaohongshu = materials.filter(m => m.platform === 'xiaohongshu').length;
  const douyin = materials.filter(m => m.platform === 'douyin').length;
  const totalReward = materials.reduce((sum, m) => sum + (m.reward || 0) * (m.current_orders || 0), 0);

  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: pendingReview } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'submitted');
  const { data: paidOrders } = await supabase.from('orders').select('reward').eq('status', 'paid');
  const totalPaid = (paidOrders || []).reduce((sum, o) => sum + (o.reward || 0), 0);

  return Response.json({
    success: true,
    data: { totalMaterials, xiaohongshu, douyin, totalOrders: totalOrders || 0, totalUsers: totalUsers || 0, totalReward, totalPaid, pendingReview: pendingReview || 0 }
  });
}
