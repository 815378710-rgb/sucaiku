// functions/api/admin/orders.js
import { getSupabase } from '../_lib/supabase.js';
import { adminAuth } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!await adminAuth(request, env)) return Response.json({ success: false, message: '未登录' }, { status: 401 });
  const supabase = getSupabase(env);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = supabase.from('orders')
    .select('*, users!inner(nickname, wechat, qrcode), materials(images)')
    .order('accepted_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);

  const { data: orders } = await query;
  const result = (orders || []).map(o => ({
    id: o.id, materialId: o.material_id, materialTitle: o.material_title,
    materialImages: o.materials ? o.materials.images : [],
    platform: o.platform, reward: o.reward, status: o.status,
    acceptedAt: o.accepted_at, submittedAt: o.submitted_at,
    postUrl: o.post_url, submitNote: o.submit_note,
    reviewNote: o.review_note, paidAt: o.paid_at,
    userName: o.users ? o.users.nickname : '未知',
    userWechat: o.users ? o.users.wechat : '',
    userQrcode: o.users ? o.users.qrcode : ''
  }));

  return Response.json({ success: true, data: result });
}
