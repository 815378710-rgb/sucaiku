// api/materials/[id]/accept.js
const { supabase } = require('../../_lib/supabase');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const { id: materialId } = req.query;
  const { userId } = req.body || {};

  if (!userId) return res.status(400).json({ success: false, message: '请先设置昵称~' });

  // Check user exists
  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  if (!user) return res.status(400).json({ success: false, message: '用户不存在' });

  // Check material
  const { data: material } = await supabase.from('materials').select('*').eq('id', materialId).single();
  if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
  if (material.status !== 'active') return res.status(400).json({ success: false, message: '素材已下架' });
  if (material.expire_at && new Date(material.expire_at) <= new Date()) {
    return res.status(400).json({ success: false, message: '素材已过期' });
  }
  if (material.current_orders >= material.max_orders) {
    return res.status(400).json({ success: false, message: '手慢啦，接单已满~' });
  }

  // Check duplicate order
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('material_id', materialId)
    .eq('user_id', userId)
    .neq('status', 'rejected')
    .limit(1);
  if (existing && existing.length > 0) {
    return res.status(400).json({ success: false, message: '你已经接过这个素材啦~' });
  }

  // Create order + increment count
  const order = {
    id: uuidv4(),
    material_id: materialId,
    user_id: userId,
    material_title: material.title,
    platform: material.platform,
    reward: material.reward,
    status: 'accepted'
  };

  await supabase.from('orders').insert(order);
  await supabase.from('materials').update({
    current_orders: material.current_orders + 1,
    updated_at: new Date().toISOString()
  }).eq('id', materialId);
  await supabase.from('users').update({
    total_orders: user.total_orders + 1,
    last_active_at: new Date().toISOString()
  }).eq('id', userId);

  res.json({ success: true, message: '接单成功~', data: { orderId: order.id } });
};
