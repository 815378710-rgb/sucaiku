// functions/api/admin/announcements.js
import { getSupabase } from '../_lib/supabase.js';
import { adminAuth } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const { data } = await supabase.from('announcements').select('*')
    .order('pinned', { ascending: false }).order('created_at', { ascending: false });
  return Response.json({ success: true, data: data || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const body = await request.json();
  const { title, content, pinned } = body || {};
  if (!title || !title.trim()) return Response.json({ success: false, message: '请输入公告标题' }, { status: 400 });

  const ann = { id: crypto.randomUUID(), title: title.trim(), content: (content || '').trim(), pinned: !!pinned, active: true };
  await supabase.from('announcements').insert(ann);
  return Response.json({ success: true, data: ann });
}
