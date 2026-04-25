// api/materials/[id].js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    const { data: material } = await supabase.from('materials').select('*').eq('id', id).single();
    if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
    return res.json({ success: true, data: {
      id: material.id, platform: material.platform, type: material.type,
      title: material.title, copyText: material.copy_text,
      images: material.images || [], reward: material.reward,
      maxOrders: material.max_orders, currentOrders: material.current_orders,
      tags: material.tags || [], status: material.status,
      expireAt: material.expire_at, createdAt: material.created_at
    }});
  }

  res.status(405).json({ success: false });
};
