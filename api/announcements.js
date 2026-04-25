// api/announcements.js
const { supabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success: false });

  const { data } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  res.json({ success: true, data: data || [] });
};
