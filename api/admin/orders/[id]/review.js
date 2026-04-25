// api/admin/orders/[id]/review.js
const { supabase } = require('../../../_lib/supabase');
const { adminAuth } = require('../../../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { id } = req.query;
  const { action, note } = req.body || {};

  const { data: order } = await supabase.from('orders').select('*').eq('id', id).single();
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'submitted') return res.status(400).json({ success: false, message: '只能审核已提交的订单' });

  if (action === 'approve') {
    await supabase.from('orders').update({
      status: 'approved', reviewed_at: new Date().toISOString(), review_note: note || ''
    }).eq('id', id);

    // Update user stats
    const { data: user } = await supabase.from('users').select('completed_orders, total_earned').eq('id', order.user_id).single();
    if (user) {
      await supabase.from('users').update({
        completed_orders: (user.completed_orders || 0) + 1,
        total_earned: (user.total_earned || 0) + order.reward
      }).eq('id', order.user_id);
    }
    return res.json({ success: true, message: '已通过~' });
  }

  if (action === 'reject') {
    await supabase.from('orders').update({
      status: 'rejected', reviewed_at: new Date().toISOString(),
      review_note: note || '不符合要求，请修改后重新提交'
    }).eq('id', id);

    // Decrement material order count
    const { data: mat } = await supabase.from('materials').select('current_orders').eq('id', order.material_id).single();
    if (mat && mat.current_orders > 0) {
      await supabase.from('materials').update({ current_orders: mat.current_orders - 1 }).eq('id', order.material_id);
    }
    return res.json({ success: true, message: '已驳回' });
  }

  res.status(400).json({ success: false, message: '无效操作' });
};
