// api/orders/my.js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: '缺少用户ID' });

  const { data: orders } = await supabase
    .from('orders')
    .select('*, materials!inner(images)')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false });

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
    paidAt: o.paid_at
  }));

  res.json({ success: true, data: result });
};
