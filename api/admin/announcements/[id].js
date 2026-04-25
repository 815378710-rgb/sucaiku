// api/admin/announcements/[id].js
const { supabase } = require('../../_lib/supabase');
const { adminAuth } = require('../../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') return res.status(405).json({ success: false });
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { id } = req.query;
  await supabase.from('announcements').delete().eq('id', id);
  res.json({ success: true, message: '已删除' });
};
