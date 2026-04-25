// functions/api/materials/[id].js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const { params, env } = context;
  const supabase = getSupabase(env);
  const { data: m } = await supabase.from('materials').select('*').eq('id', params.id).single();
  if (!m) return Response.json({ success: false, message: '素材不存在' }, { status: 404 });
  return Response.json({ success: true, data: {
    id: m.id, platform: m.platform, type: m.type, title: m.title,
    copyText: m.copy_text, images: m.images || [], reward: m.reward,
    maxOrders: m.max_orders, currentOrders: m.current_orders,
    tags: m.tags || [], status: m.status, expireAt: m.expire_at, createdAt: m.created_at
  }});
}
