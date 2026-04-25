// api/admin/materials.js
const { supabase } = require('../_lib/supabase');
const { adminAuth } = require('../_lib/auth');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  if (req.method === 'GET') {
    const { data } = await supabase.from('materials').select('*').order('created_at', { ascending: false });
    return res.json({ success: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const { platform, type, title, copyText, reward, maxOrders, tags, expireDays, images } = req.body || {};

    if (!platform || !type || !title || !reward) {
      return res.status(400).json({ success: false, message: '请填写必要字段' });
    }

    const now = new Date();
    const expireAt = expireDays && parseInt(expireDays) > 0
      ? new Date(now.getTime() + parseInt(expireDays) * 86400000).toISOString()
      : null;

    const material = {
      id: uuidv4(),
      platform, type,
      title: title.trim(),
      copy_text: (copyText || '').trim(),
      images: images || [],
      reward: parseFloat(reward),
      max_orders: Math.max(1, parseInt(maxOrders) || 10),
      current_orders: 0,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      status: 'active',
      expire_at: expireAt
    };

    await supabase.from('materials').insert(material);
    return res.json({ success: true, message: '素材发布成功~', data: material });
  }

  res.status(405).json({ success: false });
};
