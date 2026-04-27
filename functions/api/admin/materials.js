// functions/api/admin/materials.js
import { getSupabase } from '../_lib/supabase.js';
import { adminAuth } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const { data } = await supabase.from('materials').select('*').order('created_at', { ascending: false });
  return Response.json({ success: true, data: data || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const body = await request.json();
  const { platform, type, title, copyText, reward, maxOrders, tags, expireDays, images } = body || {};

  if (!platform || !type || !title || !reward) {
    return Response.json({ success: false, message: '请填写必要字段' }, { status: 400 });
  }

  const now = new Date();
  const expireAt = expireDays && parseInt(expireDays) > 0
    ? new Date(now.getTime() + parseInt(expireDays) * 86400000).toISOString() : null;

  const titleTrimmed = title.trim();
  if (titleTrimmed.length > 100) return Response.json({ success: false, message: '标题不能超过100字' }, { status: 400 });
  if ((copyText || '').length > 5000) return Response.json({ success: false, message: '文案不能超过5000字' }, { status: 400 });
  const rewardNum = parseFloat(reward);
  if (rewardNum > 99999) return Response.json({ success: false, message: '赏金不能超过99999' }, { status: 400 });

  const material = {
    id: crypto.randomUUID(), platform, type, title: titleTrimmed,
    copy_text: (copyText || '').trim().slice(0, 5000), images: images || [],
    reward: rewardNum, max_orders: Math.max(1, parseInt(maxOrders) || 10),
    current_orders: 0, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20) : [],
    status: 'active', expire_at: expireAt
  };

  await supabase.from('materials').insert(material);
  return Response.json({ success: true, message: '素材发布成功~', data: material });
}
