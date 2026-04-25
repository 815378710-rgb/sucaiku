// api/_lib/auth.js
const crypto = require('crypto');
const { supabase } = require('./supabase');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'sucaiku_v2_salt').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function adminAuth(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return null;
  const { data } = await supabase
    .from('admin_tokens')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data ? true : null;
}

module.exports = { hashPassword, generateToken, adminAuth };
