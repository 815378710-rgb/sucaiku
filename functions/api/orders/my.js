// functions/api/orders/my.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return Response.json({ success: false, message: '缺少用户ID' }, { status: 400 });

  const { data: orders } = await supabase.from('orders')
    .select('*, materials!inner(images)')
    .eq('user_id', userId).order('accepted_at', { ascending: false });

  const result = (orders || []).map(o => ({
    id: o.id, materialId: o.material_id, materialTitle: o.material_title,
    materialImages: o.materials ? o.materials.images : [],
    platform: o.platform, reward: o.reward, status: o.status,
    acceptedAt: o.accepted_at, submittedAt: o.submitted_at,
    postUrl: o.post_url, submitNote: o.submit_note,
    reviewNote: o.review_note, paidAt: o.paid_at
  }));

  return Response.json({ success: true, data: result });
}
