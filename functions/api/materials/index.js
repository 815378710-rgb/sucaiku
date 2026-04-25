// functions/api/materials/index.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform');
  const type = url.searchParams.get('type');
  const keyword = url.searchParams.get('keyword');
  const now = new Date().toISOString();

  let query = supabase.from('materials').select('*').eq('status', 'active')
    .or(`expire_at.is.null,expire_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (platform) query = query.eq('platform', platform);
  if (type) query = query.eq('type', type);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,copy_text.ilike.%${keyword}%`);

  const { data: materials } = await query;
  const result = (materials || []).map(m => ({
    id: m.id, platform: m.platform, type: m.type, title: m.title,
    copyText: m.copy_text, images: m.images || [], reward: m.reward,
    maxOrders: m.max_orders, currentOrders: m.current_orders,
    tags: m.tags || [], status: m.status, expireAt: m.expire_at,
    createdAt: m.created_at, slotsLeft: Math.max(0, m.max_orders - m.current_orders)
  }));

  return Response.json({ success: true, data: result });
}
