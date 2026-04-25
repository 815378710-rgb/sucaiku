// functions/api/user/register.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const { nickname, wechat, qrcode } = body || {};
  const nick = (nickname || '').trim();
  const wx = (wechat || '').trim();

  if (!nick || nick.length > 20) {
    return Response.json({ success: false, message: '昵称需在1-20字之间' }, { status: 400 });
  }

  let user = null;
  if (wx) {
    const { data } = await supabase.from('users').select('*').eq('wechat', wx).single();
    user = data;
  }
  if (!user) {
    const { data } = await supabase.from('users').select('*').eq('nickname', nick).eq('wechat', '').single();
    user = data;
  }

  if (!user) {
    const { data: taken } = await supabase.from('users').select('id').eq('nickname', nick).limit(1);
    if (taken && taken.length > 0) {
      return Response.json({ success: false, message: '昵称已被占用，换一个吧~' }, { status: 400 });
    }
  }

  if (user) {
    const updates = { nickname: nick, last_active_at: new Date().toISOString() };
    if (wx) updates.wechat = wx;
    if (qrcode) updates.qrcode = qrcode;
    await supabase.from('users').update(updates).eq('id', user.id);
    return Response.json({ success: true, data: { userId: user.id, nickname: nick } });
  }

  const id = crypto.randomUUID();
  const newUser = { id, nickname: nick, wechat: wx, qrcode: qrcode || '' };
  await supabase.from('users').insert(newUser);
  return Response.json({ success: true, data: { userId: id, nickname: nick } });
}
