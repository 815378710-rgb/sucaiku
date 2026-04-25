// functions/api/upload.js
import { getSupabase } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabase = getSupabase(env);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ success: false, message: '没有文件' }, { status: 400 });

  const ext = file.name.split('.').pop().toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  if (!allowed.includes(ext)) return Response.json({ success: false, message: '不支持的文件格式' }, { status: 400 });

  const fileName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = new Uint8Array(arrayBuffer);

  const { error } = await supabase.storage.from('uploads').upload(fileName, fileBuffer, {
    contentType: file.type, upsert: false
  });

  if (error) return Response.json({ success: false, message: '上传失败' }, { status: 500 });

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
  return Response.json({ success: true, url: urlData.publicUrl });
}
