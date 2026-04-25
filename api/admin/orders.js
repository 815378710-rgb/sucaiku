// api/admin/orders.js
const { supabase } = require('../_lib/supabase');
const { adminAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  if (req.method === 'GET') {
    const { status } = req.query;
    let query = supabase
      .from('orders')
      .select('*, users!inner(nickname, wechat, qrcode), materials(images)')
      .order('accepted_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);
    const { data: orders } = await query;

    const result = (orders || []).map(o => ({
      id: o.id,
      materialId: o.material_id,
      materialTitle: o.material_title,
      materialImages: o.materials ? o.materials.images : [],
      platform: o.platform,
      reward: o.reward,
      status: o.status,
      acceptedAt: o.accepted_at,
      submittedAt: o.submitted_at,
      postUrl: o.post_url,
      submitNote: o.submit_note,
      reviewNote: o.review_note,
      paidAt: o.paid_at,
      userName: o.users ? o.users.nickname : '未知',
      userWechat: o.users ? o.users.wechat : '',
      userQrcode: o.users ? o.users.qrcode : ''
    }));

    return res.json({ success: true, data: result });
  }

  res.status(405).json({ success: false });
};
