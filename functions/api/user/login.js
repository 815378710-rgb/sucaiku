// functions/api/user/login.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const wx = (body?.wechat || '').trim();
  if (!wx) return Response.json({ success: false, message: '请输入微信号' }, { status: 400 });

  const { data: user } = await supabase.from('users').select('*').eq('wechat', wx).single();
  if (!user) return Response.json({ success: false, message: '未找到该微信号关联的账号' }, { status: 404 });

  await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);
  return Response.json({ success: true, data: { userId: user.id, nickname: user.nickname } });
}
