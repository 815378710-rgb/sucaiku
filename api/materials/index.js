// api/materials/index.js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false });

  const { platform, type, keyword } = req.query;
  const now = new Date().toISOString();

  let query = supabase
    .from('materials')
    .select('*')
    .eq('status', 'active')
    .or(`expire_at.is.null,expire_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (platform) query = query.eq('platform', platform);
  if (type) query = query.eq('type', type);
  if (keyword) {
    query = query.or(`title.ilike.%${keyword}%,copy_text.ilike.%${keyword}%`);
  }

  const { data: materials, error } = await query;
  if (error) return res.status(500).json({ success: false, message: '加载失败' });

  const result = (materials || []).map(m => ({
    id: m.id,
    platform: m.platform,
    type: m.type,
    title: m.title,
    copyText: m.copy_text,
    images: m.images || [],
    reward: m.reward,
    maxOrders: m.max_orders,
    currentOrders: m.current_orders,
    tags: m.tags || [],
    status: m.status,
    expireAt: m.expire_at,
    createdAt: m.created_at,
    slotsLeft: Math.max(0, m.max_orders - m.current_orders)
  }));

  res.json({ success: true, data: result });
};
