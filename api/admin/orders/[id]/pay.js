// api/admin/orders/[id]/pay.js
const { supabase } = require('../../../_lib/supabase');
const { adminAuth } = require('../../../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { id } = req.query;
  const { data: order } = await supabase.from('orders').select('*').eq('id', id).single();
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'approved') return res.status(400).json({ success: false, message: '只能标记已审核通过的订单' });

  await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  res.json({ success: true, message: '已标记打款~' });
};
