// api/admin/users.js
const { supabase } = require('../_lib/supabase');
const { adminAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false });
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  res.json({ success: true, data: data || [] });
};
