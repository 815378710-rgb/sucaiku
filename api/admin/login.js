// api/admin/login.js
const { supabase } = require('../_lib/supabase');
const { hashPassword, generateToken } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ success: false, message: '请输入密码' });

  const { data: config } = await supabase
    .from('site_config')
    .select('value')
    .eq('key', 'admin_password_hash')
    .single();

  const storedHash = config ? config.value : '';
  const inputHash = hashPassword(password);

  if (inputHash !== storedHash) {
    return res.status(401).json({ success: false, message: '密码错误' });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('admin_tokens').insert({ token, expires_at: expiresAt });
  // Cleanup old tokens
  await supabase.from('admin_tokens').delete().lt('expires_at', new Date().toISOString());

  res.json({ success: true, token });
};
