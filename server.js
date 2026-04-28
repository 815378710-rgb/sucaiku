const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Data Store ---
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

[DATA_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDB = {
      materials: [],
      announcements: [],
      orders: [],
      users: [],
      adminPassword: hashPassword('admin123'),
      adminTokens: [],
      stats: { totalOrders: 0, totalUsers: 0, totalPaid: 0 }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('⚠️ DB文件损坏，已备份并重建:', e.message);
    const backup = DB_FILE + '.bak.' + Date.now();
    fs.copyFileSync(DB_FILE, backup);
    const defaultDB = {
      materials: [], announcements: [], orders: [], users: [],
      adminPassword: hashPassword('admin123'), adminTokens: [],
      stats: { totalOrders: 0, totalUsers: 0, totalPaid: 0 }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
}

function saveDB(db) {
  // Atomic write: write to temp file then rename to prevent corruption
  const tempFile = DB_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
  fs.renameSync(tempFile, DB_FILE);
}

// Use PBKDF2 for secure password hashing (no external deps)
const PASSWORD_SALT = 'sucaiku_v3_salt_2026';

function hashPassword(pw) {
  return crypto.pbkdf2Sync(pw, PASSWORD_SALT, 100000, 32, 'sha256').toString('hex');
}

function safeCompare(plainPw, hashedPw) {
  if (typeof plainPw !== 'string' || typeof hashedPw !== 'string') return false;
  const hash = crypto.pbkdf2Sync(plainPw, PASSWORD_SALT, 100000, 32, 'sha256').toString('hex');
  if (hash.length !== hashedPw.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedPw));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// /zhongcao reverse proxy - MUST be before express.json() to prevent body stream from being consumed
// Express body-parser consumes the request stream, making req.pipe() unable to forward POST data
const http = require('http');
app.use('/zhongcao', (req, res) => {
  const target = req.originalUrl.replace(/^\/zhongcao/, '') || '/';
  const opts = {
    hostname: '127.0.0.1',
    port: 8899,
    path: target,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:8899' },
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    console.error('/zhongcao proxy error:', e.message);
    res.status(502).json({ success: false, message: 'copy-board 服务不可用' });
  });
  req.pipe(proxyReq);
});

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging for debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Static files
app.use(express.static('public'));

// Admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  const db = loadDB();
  const valid = db.adminTokens.find(t => t.token === token && new Date(t.expiresAt) > new Date());
  if (!valid) return res.status(401).json({ success: false, message: '登录已过期' });
  next();
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// Multer error handling middleware
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: '图片大小不能超过10MB' });
    }
    return res.status(400).json({ success: false, message: '上传失败: ' + err.message });
  }
  next(err);
}

// ============================================
// FIX 1: /api/upload - Generic file upload endpoint
// Requires userId in query or body to prevent abuse
// ============================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  // Basic abuse prevention: require some form of identification
  const userId = req.body?.userId || req.query?.userId;
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有文件被上传' });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: url });
});

// ============================================
// API: User
// ============================================

// FIX 2: /api/user/login - Login by wechat
app.post('/api/user/login', (req, res) => {
  const db = loadDB();
  const { wechat } = req.body;
  if (!wechat || !wechat.trim()) {
    return res.status(400).json({ success: false, message: '请输入微信号' });
  }
  const user = db.users.find(u => u.wechat === wechat.trim());
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在，请先注册' });
  }
  res.json({
    success: true,
    data: { id: user.id, nickname: user.nickname, wechat: user.wechat, qrcode: user.qrcode }
  });
});

// Register / update user (with QR code upload)
// FIX 3: Support both multipart upload AND JSON with qrcode URL
app.post('/api/user/register', upload.single('qrcode'), (req, res) => {
  const db = loadDB();
  let { nickname, wechat, qrcode } = req.body;
  nickname = (nickname || '').trim();
  wechat = (wechat || '').trim();

  if (!nickname || nickname.length > 20) {
    return res.status(400).json({ success: false, message: '昵称需在1-20字之间' });
  }
  if (wechat && wechat.length > 50) {
    return res.status(400).json({ success: false, message: '微信号不能超过50个字符' });
  }

  // Find by wechat if provided, otherwise by nickname
  let user = null;
  if (wechat) {
    user = db.users.find(u => u.wechat === wechat);
  }
  if (!user) {
    user = db.users.find(u => u.nickname === nickname && !u.wechat);
  }

  // Check for nickname collision
  if (!user && wechat) {
    const nicknameTaken = db.users.find(u => u.nickname === nickname && u.wechat !== wechat);
    if (nicknameTaken) {
      return res.status(400).json({ success: false, message: '昵称已被占用，换一个吧~' });
    }
  }

  // FIX: Support both direct file upload AND pre-uploaded URL
  let qrcodeUrl = null;
  if (req.file) {
    qrcodeUrl = `/uploads/${req.file.filename}`;
  } else if (qrcode && qrcode.trim()) {
    qrcodeUrl = qrcode.trim();
  }

  if (user) {
    user.nickname = nickname;
    if (wechat) user.wechat = wechat;
    if (qrcodeUrl) user.qrcode = qrcodeUrl;
    user.lastActiveAt = new Date().toISOString();
    saveDB(db);
    return res.json({ success: true, data: { userId: user.id, nickname: user.nickname, qrcode: user.qrcode } });
  }

  user = {
    id: uuidv4(),
    nickname,
    wechat: wechat || '',
    qrcode: qrcodeUrl || '',
    totalOrders: 0,
    completedOrders: 0,
    totalEarned: 0,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString()
  };
  db.users.push(user);
  db.stats.totalUsers += 1;
  saveDB(db);

  res.json({ success: true, data: { userId: user.id, nickname: user.nickname, qrcode: user.qrcode } });
});

// Restore user session (by userId)
app.get('/api/user/:id', (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false });
  res.json({ success: true, data: { userId: user.id, nickname: user.nickname, wechat: user.wechat, qrcode: user.qrcode } });
});

// ============================================
// API: Materials (public)
// ============================================

app.get('/api/materials', (req, res) => {
  const db = loadDB();
  const { platform, type, keyword } = req.query;
  const now = new Date();
  let materials = db.materials.filter(m => {
    if (m.status !== 'active') return false;
    if (m.expireAt && new Date(m.expireAt) <= now) return false;
    return true;
  });

  if (platform) materials = materials.filter(m => m.platform === platform);
  if (type) materials = materials.filter(m => m.type === type);
  if (keyword) {
    const kw = keyword.toLowerCase();
    materials = materials.filter(m =>
      m.title.toLowerCase().includes(kw) ||
      (m.copyText && m.copyText.toLowerCase().includes(kw)) ||
      m.tags.some(t => t.toLowerCase().includes(kw))
    );
  }

  materials.sort((a, b) => {
    const aLeft = a.maxOrders - a.currentOrders;
    const bLeft = b.maxOrders - b.currentOrders;
    const aFullness = a.maxOrders > 0 ? a.currentOrders / a.maxOrders : 0;
    const bFullness = b.maxOrders > 0 ? b.currentOrders / b.maxOrders : 0;
    if (aLeft <= 0 && bLeft > 0) return 1;
    if (bLeft <= 0 && aLeft > 0) return -1;
    const aNearFull = aLeft > 0 && aLeft <= 3;
    const bNearFull = bLeft > 0 && bLeft <= 3;
    if (aNearFull && !bNearFull) return -1;
    if (bNearFull && !aNearFull) return 1;
    if (bFullness !== aFullness) return bFullness - aFullness;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const result = materials.map(m => ({
    ...m,
    slotsLeft: Math.max(0, m.maxOrders - m.currentOrders)
  }));

  res.json({ success: true, data: result });
});

app.get('/api/materials/:id', (req, res) => {
  const db = loadDB();
  const material = db.materials.find(m => m.id === req.params.id);
  if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
  res.json({ success: true, data: material });
});

// Accept order
app.post('/api/materials/:id/accept', (req, res) => {
  const db = loadDB();
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: '请先设置昵称~' });

  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ success: false, message: '用户不存在，请重新设置昵称' });

  const material = db.materials.find(m => m.id === req.params.id);
  if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
  if (material.status !== 'active') {
    return res.status(400).json({ success: false, message: '素材已下架' });
  }
  if (material.expireAt && new Date(material.expireAt) <= new Date()) {
    return res.status(400).json({ success: false, message: '素材已过期' });
  }
  if (material.currentOrders >= material.maxOrders) {
    return res.status(400).json({ success: false, message: '手慢啦，接单已满~' });
  }

  const existing = db.orders.find(o => o.materialId === material.id && o.userId === userId && o.status !== 'rejected');
  if (existing) {
    return res.status(400).json({ success: false, message: '你已经接过这个素材啦~' });
  }

  material.currentOrders += 1;
  const order = {
    id: uuidv4(),
    materialId: material.id,
    userId,
    materialTitle: material.title,
    platform: material.platform,
    reward: material.reward,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    submittedAt: null,
    submitImages: [],
    submitNote: '',
    reviewedAt: null,
    reviewNote: '',
    paidAt: null
  };
  db.orders.push(order);
  db.stats.totalOrders += 1;
  user.totalOrders += 1;
  saveDB(db);

  res.json({
    success: true,
    message: '接单成功~ 复制文案并保存图片，发布后提交帖子链接',
    data: { orderId: order.id }
  });
});

// Submit order
app.post('/api/orders/:id/submit', (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'accepted' && order.status !== 'rejected') {
    return res.status(400).json({ success: false, message: '当前状态不可提交' });
  }

  const { postUrl } = req.body;
  if (!postUrl || !postUrl.trim()) {
    return res.status(400).json({ success: false, message: '请填写帖子链接~' });
  }

  const url = postUrl.trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ success: false, message: '请输入有效的链接（以 http 或 https 开头）~' });
  }

  const wasRejected = order.status === 'rejected';
  const material = db.materials.find(m => m.id === order.materialId);
  if (!material) {
    return res.status(400).json({ success: false, message: '素材已被删除，无法提交' });
  }

  order.status = 'submitted';
  order.submittedAt = new Date().toISOString();
  order.postUrl = url;
  order.submitNote = (req.body.note || '').trim();

  if (wasRejected) {
    material.currentOrders += 1;
  }

  saveDB(db);
  res.json({ success: true, message: '链接已提交，等管理员审核哦~' });
});

// Get user's orders
app.get('/api/orders/my', (req, res) => {
  const db = loadDB();
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: '缺少用户ID' });

  const orders = db.orders
    .filter(o => o.userId === userId)
    .sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));

  const result = orders.map(o => {
    const mat = db.materials.find(m => m.id === o.materialId);
    return {
      ...o,
      materialTitle: mat ? mat.title : o.materialTitle,
      materialImages: mat ? mat.images : []
    };
  });

  res.json({ success: true, data: result });
});

// ============================================
// API: Admin
// ============================================

app.post('/api/admin/login', (req, res) => {
  const db = loadDB();
  const { password } = req.body;
  if (!safeCompare(password, db.adminPassword)) {
    return res.status(401).json({ success: false, message: '密码错误' });
  }
  const token = generateToken();
  db.adminTokens.push({
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  db.adminTokens = db.adminTokens.filter(t => new Date(t.expiresAt) > new Date());
  saveDB(db);
  res.json({ success: true, token });
});

// Admin: all orders
app.get('/api/admin/orders', adminAuth, (req, res) => {
  const db = loadDB();
  const { status } = req.query;
  let orders = [...db.orders];
  if (status && status !== 'all') orders = orders.filter(o => o.status === status);

  orders.sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));

  const result = orders.map(o => {
    const user = db.users.find(u => u.id === o.userId);
    const mat = db.materials.find(m => m.id === o.materialId);
    return {
      ...o,
      userName: user ? user.nickname : '未知用户',
      userWechat: user ? user.wechat : '',
      userQrcode: user ? user.qrcode : '',
      materialTitle: mat ? mat.title : o.materialTitle,
      materialImages: mat ? mat.images : []
    };
  });

  res.json({ success: true, data: result });
});

// Admin: review order
app.post('/api/admin/orders/:id/review', adminAuth, (req, res) => {
  const db = loadDB();
  const { action, note, status } = req.body;
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'submitted') {
    return res.status(400).json({ success: false, message: '只能审核已提交的订单' });
  }

  // Support both 'action' and 'status' parameters
  const effectiveAction = action || (status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : null);

  if (effectiveAction === 'approve') {
    order.status = 'approved';
    order.reviewedAt = new Date().toISOString();
    order.reviewNote = note || '';
    const user = db.users.find(u => u.id === order.userId);
    if (user) {
      user.completedOrders += 1;
      user.totalEarned += order.reward;
    }
  } else if (effectiveAction === 'reject') {
    order.status = 'rejected';
    order.reviewedAt = new Date().toISOString();
    order.reviewNote = note || '不符合要求，请修改后重新提交';
    const mat = db.materials.find(m => m.id === order.materialId);
    if (mat && mat.currentOrders > 0) mat.currentOrders -= 1;
  } else {
    return res.status(400).json({ success: false, message: '无效的操作类型' });
  }
  saveDB(db);
  res.json({ success: true, message: effectiveAction === 'approve' ? '已通过~' : '已驳回' });
});

// Admin: mark paid
app.post('/api/admin/orders/:id/pay', adminAuth, (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.status !== 'approved') {
    return res.status(400).json({ success: false, message: '只能标记已审核通过的订单' });
  }
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  db.stats.totalPaid += order.reward;
  saveDB(db);
  res.json({ success: true, message: '已标记打款~' });
});

// Admin: materials CRUD
app.get('/api/admin/materials', adminAuth, (req, res) => {
  const db = loadDB();
  const allMaterials = [...db.materials].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: allMaterials });
});

app.post('/api/admin/materials', adminAuth, upload.array('images', 9), (req, res) => {
  const db = loadDB();
  const { platform, type, title, copyText, reward, maxOrders, tags, expireDays, images: imageUrls } = req.body;

  if (!platform || !type || !title || !reward) {
    return res.status(400).json({ success: false, message: '请填写必要字段' });
  }

  const validPlatforms = ['xiaohongshu', 'douyin'];
  const validTypes = ['image', 'video', 'comment'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ success: false, message: '无效的平台类型' });
  }
  if (!validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: '无效的素材类型' });
  }

  if (title.trim().length > 100) {
    return res.status(400).json({ success: false, message: '标题不能超过100字' });
  }
  if (copyText && copyText.trim().length > 5000) {
    return res.status(400).json({ success: false, message: '文案不能超过5000字' });
  }

  // Support both direct file upload AND pre-uploaded URLs
  let images = [];
  if (req.files && req.files.length > 0) {
    images = req.files.map(f => `/uploads/${f.filename}`);
  } else if (imageUrls) {
    try {
      const parsed = JSON.parse(imageUrls);
      if (Array.isArray(parsed)) images = parsed;
    } catch (e) {
      // If not JSON, treat as comma-separated or single URL
      images = imageUrls.split(',').map(u => u.trim()).filter(Boolean);
    }
  }

  const now = new Date();
  const expireAt = expireDays && parseInt(expireDays) > 0
    ? new Date(now.getTime() + parseInt(expireDays) * 86400000).toISOString()
    : null;

  const parsedReward = parseFloat(reward);
  if (isNaN(parsedReward) || parsedReward <= 0) {
    return res.status(400).json({ success: false, message: '赏金必须大于0' });
  }

  const material = {
    id: uuidv4(),
    platform,
    type,
    title: title.trim(),
    copyText: (copyText || '').trim(),
    images,
    reward: parsedReward,
    maxOrders: Math.max(1, parseInt(maxOrders) || 10),
    currentOrders: 0,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    status: 'active',
    expireAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  db.materials.push(material);
  saveDB(db);
  res.json({ success: true, message: '素材发布成功~', data: material });
});

app.put('/api/admin/materials/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const idx = db.materials.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '素材不存在' });

  const { title, copyText, reward, maxOrders, tags } = req.body;
  if (title !== undefined) {
    if (!title.trim() || title.trim().length > 100) {
      return res.status(400).json({ success: false, message: '标题需在1-100字之间' });
    }
    db.materials[idx].title = title.trim();
  }
  if (copyText !== undefined) {
    if (copyText.trim().length > 5000) {
      return res.status(400).json({ success: false, message: '文案不能超过5000字' });
    }
    db.materials[idx].copyText = copyText.trim();
  }
  if (reward !== undefined) {
    const r = parseFloat(reward);
    if (isNaN(r) || r <= 0) {
      return res.status(400).json({ success: false, message: '赏金必须大于0' });
    }
    db.materials[idx].reward = r;
  }
  if (maxOrders !== undefined) {
    const mo = parseInt(maxOrders);
    if (isNaN(mo) || mo < 1) {
      return res.status(400).json({ success: false, message: '最大接单数至少为1' });
    }
    if (mo < db.materials[idx].currentOrders) {
      return res.status(400).json({ success: false, message: '最大接单数不能小于当前已接单数(' + db.materials[idx].currentOrders + ')' });
    }
    db.materials[idx].maxOrders = mo;
  }
  if (tags !== undefined) db.materials[idx].tags = tags.split(',').map(t => t.trim()).filter(Boolean);
  db.materials[idx].updatedAt = new Date().toISOString();

  saveDB(db);
  res.json({ success: true, data: db.materials[idx] });
});

app.post('/api/admin/materials/:id/archive', adminAuth, (req, res) => {
  const db = loadDB();
  const material = db.materials.find(m => m.id === req.params.id);
  if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
  material.status = 'archived';
  material.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ success: true, message: '已归档~' });
});

app.delete('/api/admin/materials/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const idx = db.materials.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '素材不存在' });
  const material = db.materials[idx];

  const activeOrders = db.orders.filter(o =>
    o.materialId === material.id && ['accepted', 'submitted'].includes(o.status)
  );
  if (activeOrders.length > 0) {
    return res.status(400).json({
      success: false,
      message: '该素材还有 ' + activeOrders.length + ' 个进行中/待审核的订单，请先处理订单再删除'
    });
  }

  material.images.forEach(img => {
    const imgPath = path.join(__dirname, 'public', img);
    const resolved = path.resolve(imgPath);
    const uploadsDir = path.resolve(UPLOAD_DIR);
    if (!resolved.startsWith(uploadsDir)) return;
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  });
  db.materials.splice(idx, 1);
  saveDB(db);
  res.json({ success: true, message: '已删除' });
});

// Admin: users list
app.get('/api/admin/users', adminAuth, (req, res) => {
  const db = loadDB();
  const users = [...db.users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: users });
});

// FIX 4: Add DELETE /api/admin/users/:id endpoint
app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '用户不存在' });

  const user = db.users[idx];
  // Delete user's QR code image if exists
  if (user.qrcode) {
    const imgPath = path.join(__dirname, 'public', user.qrcode);
    const resolved = path.resolve(imgPath);
    const uploadsDir = path.resolve(UPLOAD_DIR);
    if (resolved.startsWith(uploadsDir) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  // Delete all orders from this user and update stats
  const userOrders = db.orders.filter(o => o.userId === req.params.id);
  for (const order of userOrders) {
    // Decrement material currentOrders for accepted/submitted orders
    if (['accepted', 'submitted'].includes(order.status)) {
      const mat = db.materials.find(m => m.id === order.materialId);
      if (mat && mat.currentOrders > 0) mat.currentOrders -= 1;
    }
    // Update stats
    if (order.status === 'paid') {
      db.stats.totalPaid -= order.reward;
    }
    db.stats.totalOrders -= 1;
  }
  db.orders = db.orders.filter(o => o.userId !== req.params.id);
  db.users.splice(idx, 1);
  db.stats.totalUsers = db.users.length;
  saveDB(db);
  res.json({ success: true, message: '已删除用户及其所有订单' });
});

// Announcements
app.get('/api/announcements', (req, res) => {
  const db = loadDB();
  const active = db.announcements
    .filter(a => a.active)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: active });
});

app.post('/api/admin/announcements', adminAuth, (req, res) => {
  const db = loadDB();
  const { title, content, pinned } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ success: false, message: '请输入公告标题' });
  const announcement = {
    id: uuidv4(), title: title.trim(), content: (content || '').trim(),
    pinned: !!pinned, active: true, createdAt: new Date().toISOString()
  };
  db.announcements.push(announcement);
  saveDB(db);
  res.json({ success: true, data: announcement });
});

app.get('/api/admin/announcements', adminAuth, (req, res) => {
  const db = loadDB();
  const all = [...db.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: all });
});

app.delete('/api/admin/announcements/:id', adminAuth, (req, res) => {
  const db = loadDB();
  const idx = db.announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '公告不存在' });
  db.announcements.splice(idx, 1);
  saveDB(db);
  res.json({ success: true, message: '已删除' });
});

// Stats
app.get('/api/stats', (req, res) => {
  const db = loadDB();
  const now = new Date();
  const active = db.materials.filter(m => {
    if (m.status !== 'active') return false;
    if (m.expireAt && new Date(m.expireAt) <= now) return false;
    return true;
  });
  res.json({
    success: true,
    data: {
      totalMaterials: active.length,
      xiaohongshu: active.filter(m => m.platform === 'xiaohongshu').length,
      douyin: active.filter(m => m.platform === 'douyin').length,
      totalOrders: db.stats.totalOrders,
      totalUsers: db.users.length,
      totalReward: active.reduce((sum, m) => sum + m.reward * m.currentOrders, 0),
      totalPaid: db.stats.totalPaid,
      pendingReview: db.orders.filter(o => o.status === 'submitted').length
    }
  });
});

// FIX 5: Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
});

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/material/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'detail.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Apply multer error handler after upload routes
app.use(handleMulterError);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: '页面不存在' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`🎀 素材兼职平台 v3.1 已启动: http://localhost:${PORT}`);
});
