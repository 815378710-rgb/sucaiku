// api/upload.js
const { supabase } = require('../_lib/supabase');
const { v4: uuidv4 } = require('uuid');
const multiparty = require('multiparty');

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const form = new multiparty.Form();
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const file = files.file ? files.file[0] : null;
  if (!file) return res.status(400).json({ success: false, message: '没有文件' });

  const ext = file.originalFilename.split('.').pop().toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  if (!allowed.includes(ext)) return res.status(400).json({ success: false, message: '不支持的文件格式' });

  const fileName = `${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
  const fs = require('fs');
  const fileBuffer = fs.readFileSync(file.path);

  const { error } = await supabase.storage
    .from('uploads')
    .upload(fileName, fileBuffer, {
      contentType: file.headers['content-type'],
      upsert: false
    });

  if (error) return res.status(500).json({ success: false, message: '上传失败' });

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);

  res.json({ success: true, url: urlData.publicUrl });
};
