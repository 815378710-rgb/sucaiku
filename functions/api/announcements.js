// functions/api/announcements.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { env } = context;
  const supabase = getSupabase(env);
  const { data } = await supabase.from('announcements').select('*')
    .eq('active', true).order('pinned', { ascending: false }).order('created_at', { ascending: false });
  return Response.json({ success: true, data: data || [] });
}
