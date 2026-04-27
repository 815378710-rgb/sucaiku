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
  if (!wx) {
    return Response.json({ success: false, message: '请填写微信号~' }, { status: 400 });
  }

  // 检查昵称是否已被占用（无论微信号是否为空）
  const { data: nickTaken } = await supabase.from('users').select('id, wechat').eq('nickname', nick).limit(1);
  if (nickTaken && nickTaken.length > 0) {
    // 如果昵称已存在，但该记录的微信号为空或与当前相同，允许合并（更新）
    if (nickTaken[0].wechat && nickTaken[0].wechat !== wx) {
      return Response.json({ success: false, message: '昵称已被占用，换一个吧~' }, { status: 400 });
    }
    // 微信号相同或为空，走合并逻辑
    user = { id: nickTaken[0].id };
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
