// sucaiku Express 服务端 - SQLite 本地数据库版本
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

// 数据库 - 数据文件放在 /app/data 目录，Docker volume 挂载
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'sucaiku.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    wechat TEXT NOT NULL DEFAULT '',
    qrcode TEXT NOT NULL DEFAULT '',
    total_orders INTEGER NOT NULL DEFAULT 0,
    completed_orders INTEGER NOT NULL DEFAULT 0,
    total_earned REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    copy_text TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    reward REAL NOT NULL,
    max_orders INTEGER NOT NULL DEFAULT 10,
    current_orders INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    expire_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    material_title TEXT NOT NULL,
    platform TEXT NOT NULL,
    reward REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at TEXT,
    post_url TEXT,
    submit_note TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    review_note TEXT NOT NULL DEFAULT '',
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_tokens (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_wechat ON users(wechat) WHERE wechat != '';
  CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_material ON orders(material_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// 初始化默认管理员密码（如果没有的话）
const existingPassword = db.prepare("SELECT value FROM site_config WHERE key = 'admin_password'").get();
if (!existingPassword) {
  const defaultHash = crypto.createHash('sha256').update('admin123' + 'sucaiku_v2_salt').digest('hex');
  db.prepare("INSERT INTO site_config (key, value) VALUES ('admin_password', ?)").run(defaultHash);
  console.log('🔑 默认管理员密码: admin123（请尽快修改！）');
}

// 中间件
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ================================================
// 工具函数
// ================================================

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'sucaiku_v2_salt').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function adminAuth(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  const row = db.prepare("SELECT * FROM admin_tokens WHERE token = ? AND expires_at > datetime('now')").get(token);
  return !!row;
}

function parseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ================================================
// 用户端 API
// ================================================

// 素材列表
app.get('/api/materials', (req, res) => {
  try {
    const { platform, type, keyword } = req.query;
    let sql = `SELECT * FROM materials WHERE status = 'active' AND (expire_at IS NULL OR expire_at > datetime('now'))`;
    const params = [];

    if (platform) { sql += ` AND platform = ?`; params.push(platform); }
    if (type) { sql += ` AND type = ?`; params.push(type); }
    if (keyword) { sql += ` AND (title LIKE ? OR copy_text LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }

    sql += ` ORDER BY created_at DESC`;
    const materials = db.prepare(sql).all(...params);

    const result = materials.map(m => ({
      id: m.id, platform: m.platform, type: m.type, title: m.title,
      copyText: m.copy_text, images: parseJSON(m.images, []), reward: m.reward,
      maxOrders: m.max_orders, currentOrders: m.current_orders,
      tags: parseJSON(m.tags, []), expireAt: m.expire_at, createdAt: m.created_at
    }));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting materials:', error);
    res.status(500).json({ success: false, message: '获取素材列表失败' });
  }
});

// 素材详情
app.get('/api/materials/:id', (req, res) => {
  try {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: '素材不存在' });

    res.json({
      success: true, data: {
        id: material.id, platform: material.platform, type: material.type, title: material.title,
        copyText: material.copy_text, images: parseJSON(material.images, []), reward: material.reward,
        maxOrders: material.max_orders, currentOrders: material.current_orders,
        tags: parseJSON(material.tags, []), expireAt: material.expire_at, createdAt: material.created_at
      }
    });
  } catch (error) {
    console.error('Error getting material:', error);
    res.status(500).json({ success: false, message: '获取素材详情失败' });
  }
});

// 接单
app.post('/api/materials/:id/accept', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: '请先登录' });

    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: '素材不存在' });
    if (material.status !== 'active') return res.status(400).json({ success: false, message: '该素材已下架' });
    if (material.current_orders >= material.max_orders) return res.status(400).json({ success: false, message: '接单已满' });
    if (material.expire_at && new Date(material.expire_at) < new Date()) return res.status(400).json({ success: false, message: '已过期' });

    const existing = db.prepare('SELECT id FROM orders WHERE material_id = ? AND user_id = ? AND status = ?').get(req.params.id, userId, 'accepted');
    if (existing) return res.status(400).json({ success: false, message: '你已经接过这个任务了' });

    const orderId = uuidv4();
    db.prepare(`INSERT INTO orders (id, material_id, user_id, material_title, platform, reward, status) VALUES (?, ?, ?, ?, ?, ?, 'accepted')`)
      .run(orderId, req.params.id, userId, material.title, material.platform, material.reward);
    db.prepare('UPDATE materials SET current_orders = current_orders + 1 WHERE id = ?').run(req.params.id);

    res.json({ success: true, data: { id: orderId, materialId: req.params.id, userId, status: 'accepted' } });
  } catch (error) {
    console.error('Error accepting material:', error);
    res.status(500).json({ success: false, message: '接单失败' });
  }
});

// 我的订单
app.get('/api/orders/my', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: '请先登录' });

    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY accepted_at DESC').all(userId);
    const result = orders.map(o => ({
      id: o.id, materialId: o.material_id, materialTitle: o.material_title,
      platform: o.platform, reward: o.reward, status: o.status,
      acceptedAt: o.accepted_at, submittedAt: o.submitted_at,
      postUrl: o.post_url, submitNote: o.submit_note,
      reviewedAt: o.reviewed_at, reviewNote: o.review_note, paidAt: o.paid_at
    }));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting my orders:', error);
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

// 提交订单
app.post('/api/orders/:id/submit', (req, res) => {
  try {
    const { postUrl, submitNote } = req.body;
    if (!postUrl) return res.status(400).json({ success: false, message: '请输入发布链接' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (order.status !== 'accepted' && order.status !== 'rejected') return res.status(400).json({ success: false, message: '当前状态不可提交' });

    db.prepare(`UPDATE orders SET status = 'submitted', post_url = ?, submit_note = ?, submitted_at = datetime('now') WHERE id = ?`)
      .run(postUrl, submitNote || '', req.params.id);
    res.json({ success: true, message: '提交成功' });
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({ success: false, message: '提交失败' });
  }
});

// 用户登录
app.post('/api/user/login', (req, res) => {
  try {
    const { wechat } = req.body;
    if (!wechat) return res.status(400).json({ success: false, message: '请输入微信号' });

    const user = db.prepare('SELECT * FROM users WHERE wechat = ?').get(wechat);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run(user.id);
    res.json({ success: true, data: { id: user.id, nickname: user.nickname, wechat: user.wechat } });
  } catch (error) {
    console.error('Error user login:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

// 用户注册
app.post('/api/user/register', (req, res) => {
  try {
    const { nickname, wechat, qrcode } = req.body;
    if (!nickname) return res.status(400).json({ success: false, message: '请输入昵称' });
    if (!wechat) return res.status(400).json({ success: false, message: '请输入微信号' });

    const existing = db.prepare('SELECT id FROM users WHERE wechat = ?').get(wechat);
    if (existing) return res.status(400).json({ success: false, message: '该微信号已注册' });

    const userId = uuidv4();
    db.prepare('INSERT INTO users (id, nickname, wechat, qrcode) VALUES (?, ?, ?, ?)').run(userId, nickname, wechat, qrcode || '');
    res.json({ success: true, data: { id: userId, nickname, wechat } });
  } catch (error) {
    console.error('Error user register:', error);
    res.status(500).json({ success: false, message: '注册失败' });
  }
});

// 用户详情
app.get('/api/user/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json({
      success: true, data: {
        id: user.id, nickname: user.nickname, wechat: user.wechat,
        qrcode: user.qrcode, totalOrders: user.total_orders,
        completedOrders: user.completed_orders, totalEarned: user.total_earned,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, message: '获取用户信息失败' });
  }
});

// 公告
app.get('/api/announcements', (req, res) => {
  try {
    const announcements = db.prepare('SELECT * FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC').all();
    const result = announcements.map(a => ({
      id: a.id, title: a.title, content: a.content, pinned: !!a.pinned, createdAt: a.created_at
    }));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting announcements:', error);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

// 统计
app.get('/api/stats', (req, res) => {
  try {
    const materials = db.prepare("SELECT COUNT(*) as count FROM materials WHERE status = 'active'").get().count;
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    res.json({ success: true, data: { materials, users, orders } });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

// 文件上传
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择文件' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error uploading:', error);
    res.status(500).json({ success: false, message: '上传失败' });
  }
});

// ================================================
// 管理员 API
// ================================================

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: '请输入密码' });

    const hash = hashPassword(password);
    const config = db.prepare("SELECT value FROM site_config WHERE key = 'admin_password'").get();
    if (!config || config.value !== hash) return res.status(401).json({ success: false, message: '密码错误' });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO admin_tokens (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
    res.json({ success: true, token });
  } catch (error) {
    console.error('Error admin login:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

// 管理素材列表
app.get('/api/admin/materials', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const materials = db.prepare('SELECT * FROM materials ORDER BY created_at DESC').all();
    res.json({ success: true, data: materials.map(m => ({ ...m, images: parseJSON(m.images, []), tags: parseJSON(m.tags, []) })) });
  } catch (error) {
    console.error('Error admin materials:', error);
    res.status(500).json({ success: false, message: '获取素材列表失败' });
  }
});

// 创建素材
app.post('/api/admin/materials', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const { platform, type, title, copyText, images, reward, maxOrders, tags, expireAt } = req.body;
    if (!platform || !type || !title || reward === undefined) return res.status(400).json({ success: false, message: '缺少必填字段' });

    const id = uuidv4();
    db.prepare(`INSERT INTO materials (id, platform, type, title, copy_text, images, reward, max_orders, tags, expire_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, platform, type, title, copyText || '', JSON.stringify(images || []), reward, maxOrders || 10, JSON.stringify(tags || []), expireAt || null);
    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error creating material:', error);
    res.status(500).json({ success: false, message: '创建素材失败' });
  }
});

// 更新素材
app.put('/api/admin/materials/:id', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '素材不存在' });

    const { platform, type, title, copyText, images, reward, maxOrders, tags, expireAt, status } = req.body;
    db.prepare(`UPDATE materials SET
      platform = COALESCE(?, platform), type = COALESCE(?, type), title = COALESCE(?, title),
      copy_text = COALESCE(?, copy_text), images = COALESCE(?, images), reward = COALESCE(?, reward),
      max_orders = COALESCE(?, max_orders), tags = COALESCE(?, tags), expire_at = COALESCE(?, expire_at),
      status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`)
      .run(
        platform || null, type || null, title || null,
        copyText !== undefined ? copyText : null,
        images ? JSON.stringify(images) : null,
        reward !== undefined ? reward : null,
        maxOrders !== undefined ? maxOrders : null,
        tags ? JSON.stringify(tags) : null,
        expireAt !== undefined ? expireAt : null,
        status || null, req.params.id
      );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({ success: false, message: '更新素材失败' });
  }
});

// 归档素材
app.post('/api/admin/materials/:id/archive', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    db.prepare("UPDATE materials SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: '已归档' });
  } catch (error) {
    console.error('Error archiving material:', error);
    res.status(500).json({ success: false, message: '归档失败' });
  }
});

// 管理订单列表
app.get('/api/admin/orders', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const { status } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY accepted_at DESC';
    const orders = db.prepare(sql).all(...params);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error admin orders:', error);
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

// 审核订单
app.post('/api/admin/orders/:id/review', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const { status: newStatus, reviewNote } = req.body;
    if (!['approved', 'rejected'].includes(newStatus)) return res.status(400).json({ success: false, message: '无效状态' });

    db.prepare("UPDATE orders SET status = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?")
      .run(newStatus, reviewNote || '', req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reviewing order:', error);
    res.status(500).json({ success: false, message: '审核失败' });
  }
});

// 打款
app.post('/api/admin/orders/:id/pay', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (order.status !== 'approved') return res.status(400).json({ success: false, message: '订单未审核通过' });

    db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(req.params.id);
    db.prepare('UPDATE users SET completed_orders = completed_orders + 1, total_earned = total_earned + ? WHERE id = ?')
      .run(order.reward, order.user_id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error paying order:', error);
    res.status(500).json({ success: false, message: '打款失败' });
  }
});

// 管理公告列表
app.get('/api/admin/announcements', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
    res.json({ success: true, data: announcements.map(a => ({ ...a, pinned: !!a.pinned, active: !!a.active })) });
  } catch (error) {
    console.error('Error admin announcements:', error);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

// 创建公告
app.post('/api/admin/announcements', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const { title, content, pinned } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, message: '请输入公告标题' });

    const id = uuidv4();
    db.prepare('INSERT INTO announcements (id, title, content, pinned) VALUES (?, ?, ?, ?)')
      .run(id, title.trim(), (content || '').trim(), pinned ? 1 : 0);
    res.json({ success: true, data: { id, title: title.trim(), content: (content || '').trim(), pinned: !!pinned } });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, message: '创建公告失败' });
  }
});

// 删除公告
app.delete('/api/admin/announcements/:id', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// 用户管理
app.get('/api/admin/users', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error admin users:', error);
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// 修改管理员密码
app.post('/api/admin/change-password', (req, res) => {
  try {
    if (!adminAuth(req)) return res.status(401).json({ success: false, message: '未登录' });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '请输入密码' });

    const oldHash = hashPassword(oldPassword);
    const config = db.prepare("SELECT value FROM site_config WHERE key = 'admin_password'").get();
    if (!config || config.value !== oldHash) return res.status(401).json({ success: false, message: '原密码错误' });

    const newHash = hashPassword(newPassword);
    db.prepare("UPDATE site_config SET value = ? WHERE key = 'admin_password'").run(newHash);
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: '修改密码失败' });
  }
});

// ================================================
// SPA 路由 (前端页面)
// ================================================
app.get('/material/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'detail.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '3.0.0', engine: 'sqlite' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🥔 素材库 sucaiku v3.0 (SQLite) 运行在 http://0.0.0.0:${PORT}`);
  console.log(`📂 数据目录: ${DATA_DIR}`);
  console.log(`📄 数据库: ${DB_PATH}`);
});