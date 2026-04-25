// api/user/login.js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const { wechat } = req.body || {};
  const wx = (wechat || '').trim();
  if (!wx) return res.status(400).json({ success: false, message: '请输入微信号' });

  const { data: user } = await supabase.from('users').select('*').eq('wechat', wx).single();
  if (!user) return res.status(404).json({ success: false, message: '未找到该微信号关联的账号' });

  await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);
  res.json({ success: true, data: { userId: user.id, nickname: user.nickname } });
};
