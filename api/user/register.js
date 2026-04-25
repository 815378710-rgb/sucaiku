// api/user/register.js
const { supabase } = require('../_lib/supabase');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  // Parse multipart form data manually (Vercel doesn't support multer)
  // For now, accept JSON with base64 qrcode or URL
  const { nickname, wechat, qrcode } = req.body || {};
  const nick = (nickname || '').trim();
  const wx = (wechat || '').trim();

  if (!nick || nick.length > 20) {
    return res.status(400).json({ success: false, message: '昵称需在1-20字之间' });
  }
  if (wx && wx.length > 50) {
    return res.status(400).json({ success: false, message: '微信号不能超过50个字符' });
  }

  // Find existing user by wechat
  let user = null;
  if (wx) {
    const { data } = await supabase.from('users').select('*').eq('wechat', wx).single();
    user = data;
  }
  if (!user) {
    const { data } = await supabase.from('users').select('*').eq('nickname', nick).eq('wechat', '').single();
    user = data;
  }

  // Check nickname collision
  if (!user) {
    const { data: taken } = await supabase.from('users').select('id').eq('nickname', nick).limit(1);
    if (taken && taken.length > 0) {
      return res.status(400).json({ success: false, message: '昵称已被占用，换一个吧~' });
    }
  }

  if (user) {
    // Update existing user
    const updates = { nickname: nick, last_active_at: new Date().toISOString() };
    if (wx) updates.wechat = wx;
    if (qrcode) updates.qrcode = qrcode;
    await supabase.from('users').update(updates).eq('id', user.id);
    return res.json({ success: true, data: { userId: user.id, nickname: nick } });
  }

  // Create new user
  const newUser = {
    id: uuidv4(),
    nickname: nick,
    wechat: wx,
    qrcode: qrcode || '',
  };
  await supabase.from('users').insert(newUser);
  res.json({ success: true, data: { userId: newUser.id, nickname: nick } });
};
