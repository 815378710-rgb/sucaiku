// api/admin/announcements.js
const { supabase } = require('../_lib/supabase');
const { adminAuth } = require('../_lib/auth');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  const authed = await adminAuth(req);
  if (!authed) return res.status(401).json({ success: false, message: '未登录' });

  if (req.method === 'GET') {
    const { data } = await supabase.from('announcements').select('*')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false });
    return res.json({ success: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const { title, content, pinned } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ success: false, message: '请输入公告标题' });
    const ann = { id: uuidv4(), title: title.trim(), content: (content || '').trim(), pinned: !!pinned, active: true };
    await supabase.from('announcements').insert(ann);
    return res.json({ success: true, data: ann });
  }

  res.status(405).json({ success: false });
};
