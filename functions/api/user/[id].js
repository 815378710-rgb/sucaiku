// functions/api/user/[id].js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { params, env } = context;
  const supabase = getSupabase(env);
  const { data: user } = await supabase.from('users').select('*').eq('id', params.id).single();
  if (!user) return Response.json({ success: false }, { status: 404 });
  return Response.json({ success: true, data: { userId: user.id, nickname: user.nickname, wechat: user.wechat, qrcode: user.qrcode } });
}
