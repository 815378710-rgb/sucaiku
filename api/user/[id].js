// api/user/[id].js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false });
  const { id } = req.query;
  const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
  if (!user) return res.status(404).json({ success: false });
  res.json({ success: true, data: { userId: user.id, nickname: user.nickname, wechat: user.wechat, qrcode: user.qrcode } });
};
