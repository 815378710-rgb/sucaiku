// api/orders/[id]/submit.js
const { supabase } = require('../../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const { id: orderId } = req.query;
  const { postUrl, note } = req.body || {};

  if (!postUrl || !postUrl.trim()) {
    return res.status(400).json({ success: false, message: '请粘贴分享的文字~' });
  }

  // Auto-extract URL from share text
  const urlMatch = postUrl.trim().match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
  if (!urlMatch) {
    return res.status(400).json({ success: false, message: '没有找到链接，直接粘贴分享的整段文字就行~' });
  }
  const url = urlMatch[0].replace(/[，。！？、）》】]+$/, '');

  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'accepted' && order.status !== 'rejected') {
    return res.status(400).json({ success: false, message: '当前状态不可提交' });
  }

  const wasRejected = order.status === 'rejected';

  // Check material exists
  const { data: material } = await supabase.from('materials').select('id').eq('id', order.material_id).single();
  if (!material) return res.status(400).json({ success: false, message: '素材已被删除' });

  const updates = {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    post_url: url,
    submit_note: (note || '').trim()
  };

  if (wasRejected) {
    // Re-increment material order count
    const { data: mat } = await supabase.from('materials').select('current_orders').eq('id', order.material_id).single();
    if (mat) {
      await supabase.from('materials').update({ current_orders: mat.current_orders + 1 }).eq('id', order.material_id);
    }
  }

  await supabase.from('orders').update(updates).eq('id', orderId);
  res.json({ success: true, message: '链接已提交，等审核哦~' });
};
