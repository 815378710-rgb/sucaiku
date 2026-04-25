// api/admin/materials/[id].js
const { supabase } = require('../../_lib/supabase');
const { adminAuth } = require('../../_lib/auth');

module.exports = async (req, res) => {
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { id } = req.query;

  if (req.method === 'PUT') {
    const { title, copyText, reward, maxOrders, tags } = req.body || {};
    const updates = { updated_at: new Date().toISOString() };

    if (title !== undefined) {
      if (!title.trim() || title.trim().length > 100) {
        return res.status(400).json({ success: false, message: '标题需在1-100字之间' });
      }
      updates.title = title.trim();
    }
    if (copyText !== undefined) updates.copy_text = copyText.trim();
    if (reward !== undefined) {
      const r = parseFloat(reward);
      if (isNaN(r) || r <= 0) return res.status(400).json({ success: false, message: '赏金必须大于0' });
      updates.reward = r;
    }
    if (maxOrders !== undefined) {
      const mo = parseInt(maxOrders);
      if (isNaN(mo) || mo < 1) return res.status(400).json({ success: false, message: '最大接单数至少为1' });
      updates.max_orders = mo;
    }
    if (tags !== undefined) updates.tags = tags.split(',').map(t => t.trim()).filter(Boolean);

    await supabase.from('materials').update(updates).eq('id', id);
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    // Check active orders
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('material_id', id)
      .in('status', ['accepted', 'submitted']);
    if (activeOrders && activeOrders.length > 0) {
      return res.status(400).json({ success: false, message: '该素材还有进行中的订单，请先处理' });
    }
    await supabase.from('materials').delete().eq('id', id);
    return res.json({ success: true, message: '已删除' });
  }

  res.status(405).json({ success: false });
};
