-- 素材兼职平台 v3.0 - Supabase 数据库初始化

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(20) NOT NULL,
  wechat VARCHAR(50) DEFAULT '',
  qrcode TEXT DEFAULT '',
  total_orders INT DEFAULT 0,
  completed_orders INT DEFAULT 0,
  total_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(100) NOT NULL,
  copy_text TEXT DEFAULT '',
  images TEXT[] DEFAULT '{}',
  reward NUMERIC NOT NULL,
  max_orders INT DEFAULT 10,
  current_orders INT DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL,
  user_id UUID NOT NULL,
  material_title VARCHAR(100),
  platform VARCHAR(20),
  reward NUMERIC,
  status VARCHAR(20) DEFAULT 'accepted',
  accepted_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  post_url TEXT,
  submit_note TEXT DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  review_note TEXT DEFAULT '',
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  content TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_tokens (
  token VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS site_config (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL
);

-- 默认管理员密码: admin123
INSERT INTO site_config (key, value)
VALUES ('admin_password_hash', encode(sha256(('admin123' || 'sucaiku_v2_salt')::bytea), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_wechat ON users(wechat) WHERE wechat != '';
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_material ON orders(material_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
