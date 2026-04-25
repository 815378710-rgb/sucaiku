// api/admin/materials/[id]/archive.js
const { supabase } = require('../../../_lib/supabase');
const { adminAuth } = require('../../../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { id } = req.query;
  await supabase.from('materials').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  res.json({ success: true, message: '已归档~' });
};
