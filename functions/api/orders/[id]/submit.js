// functions/api/orders/[id]/submit.js
import { getSupabase } from '../../_lib/supabase.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const supabase = getSupabase(env);
  const body = await request.json();
  const rawText = body?.postUrl || '';
  const note = body?.note || '';

  if (!rawText.trim()) {
    return Response.json({ success: false, message: '请粘贴分享的文字~' }, { status: 400 });
  }

  const urlMatch = rawText.trim().match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
  if (!urlMatch) {
    return Response.json({ success: false, message: '没有找到链接，直接粘贴分享的整段文字就行~' }, { status: 400 });
  }
  const url = urlMatch[0].replace(/[，。！？、）》】]+$/, '');

  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();
  if (!order) return Response.json({ success: false, message: '订单不存在' }, { status: 404 });
  if (order.status !== 'accepted' && order.status !== 'rejected') {
    return Response.json({ success: false, message: '当前状态不可提交' }, { status: 400 });
  }

  const wasRejected = order.status === 'rejected';
  const { data: material } = await supabase.from('materials').select('id').eq('id', order.material_id).single();
  if (!material) return Response.json({ success: false, message: '素材已被删除' }, { status: 400 });

  if (wasRejected) {
    // 使用乐观锁防止竞态
    const { data: mat } = await supabase.from('materials').select('current_orders').eq('id', order.material_id).single();
    if (mat) {
      const { error } = await supabase.from('materials').update({
        current_orders: mat.current_orders + 1
      }).eq('id', order.material_id).eq('current_orders', mat.current_orders);
      if (error) {
        // 乐观锁失败，重新读取再试一次
        const { data: mat2 } = await supabase.from('materials').select('current_orders').eq('id', order.material_id).single();
        if (mat2) await supabase.from('materials').update({ current_orders: mat2.current_orders + 1 }).eq('id', order.material_id);
      }
    }
  }

  await supabase.from('orders').update({
    status: 'submitted', submitted_at: new Date().toISOString(),
    post_url: url, submit_note: note.trim()
  }).eq('id', params.id);

  return Response.json({ success: true, message: '链接已提交，等审核哦~' });
}
