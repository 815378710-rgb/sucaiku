// functions/api/user/[id].js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { params, request, env } = context;
  const supabase = getSupabase(env);

  // 只允许查询自己的信息，防止泄露微信号和收款码
  const requestUserId = request.headers.get('x-user-id');
  if (!requestUserId || requestUserId !== params.id) {
    return Response.json({ success: false, message: '无权访问' }, { status: 403 });
  }

  const { data: user } = await supabase.from('users').select('*').eq('id', params.id).single();
  if (!user) return Response.json({ success: false }, { status: 404 });
  return Response.json({ success: true, data: { userId: user.id, nickname: user.nickname, wechat: user.wechat, qrcode: user.qrcode } });
}
