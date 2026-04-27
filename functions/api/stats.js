// functions/api/stats.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { env } = context;
  const supabase = getSupabase(env);
  const now = new Date().toISOString();

  // 使用单次聚合查询获取所有统计数据，保证一致性
  const { data: stats } = await supabase.rpc('get_dashboard_stats', { now_time: now });

  if (stats && stats.length > 0) {
    const s = stats[0];
    return Response.json({
      success: true,
      data: {
        totalMaterials: s.total_materials || 0,
        xiaohongshu: s.xiaohongshu || 0,
        douyin: s.douyin || 0,
        totalReward: s.total_reward || 0,
        totalOrders: s.total_orders || 0,
        totalUsers: s.total_users || 0,
        pendingReview: s.pending_review || 0,
        totalPaid: s.total_paid || 0
      }
    });
  }

  // 降级：分别查询（可能有短暂不一致）
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
