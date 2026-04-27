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

-- 默认管理员密码通过 site_config 表管理，首次部署后请立即修改
INSERT INTO site_config (key, value)
VALUES ('admin_password_hash', encode(sha256(('admin123' || 'sucaiku_v2_salt')::bytea), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_wechat ON users(wechat) WHERE wechat != '';
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_material ON orders(material_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 外键约束（防止孤儿订单）
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS fk_orders_material
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 原子递增接单数函数（防止竞态超额接单）
CREATE OR REPLACE FUNCTION increment_orders(mat_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_rows INTEGER;
BEGIN
  UPDATE materials
  SET current_orders = current_orders + 1, updated_at = now()
  WHERE id = mat_id AND current_orders < max_orders;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$ LANGUAGE plpgsql;

-- 原子递减接单数函数（防止竞态导致负数）
CREATE OR REPLACE FUNCTION decrement_orders(mat_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_rows INTEGER;
BEGIN
  UPDATE materials
  SET current_orders = current_orders - 1, updated_at = now()
  WHERE id = mat_id AND current_orders > 0;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$ LANGUAGE plpgsql;

-- 原子递增用户接单数
CREATE OR REPLACE FUNCTION increment_user_orders(uid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET total_orders = total_orders + 1, last_active_at = now()
  WHERE id = uid;
END;
$$ LANGUAGE plpgsql;

-- 原子递增用户完成单数和收益
CREATE OR REPLACE FUNCTION increment_user_completed(uid UUID, reward_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET completed_orders = completed_orders + 1,
      total_earned = total_earned + reward_amount
  WHERE id = uid;
END;
$$ LANGUAGE plpgsql;

-- 仪表盘统计聚合（保证数据一致性）
CREATE OR REPLACE FUNCTION get_dashboard_stats(now_time TIMESTAMPTZ)
RETURNS TABLE (
  total_materials BIGINT,
  xiaohongshu BIGINT,
  douyin BIGINT,
  total_reward NUMERIC,
  total_orders BIGINT,
  total_users BIGINT,
  pending_review BIGINT,
  total_paid NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM materials WHERE status = 'active' AND (expire_at IS NULL OR expire_at > now_time)),
    (SELECT COUNT(*) FROM materials WHERE status = 'active' AND (expire_at IS NULL OR expire_at > now_time) AND platform = 'xiaohongshu'),
    (SELECT COUNT(*) FROM materials WHERE status = 'active' AND (expire_at IS NULL OR expire_at > now_time) AND platform = 'douyin'),
    (SELECT COALESCE(SUM(reward * current_orders), 0) FROM materials WHERE status = 'active' AND (expire_at IS NULL OR expire_at > now_time)),
    (SELECT COUNT(*) FROM orders),
    (SELECT COUNT(*) FROM users),
    (SELECT COUNT(*) FROM orders WHERE status = 'submitted'),
    (SELECT COALESCE(SUM(reward), 0) FROM orders WHERE status = 'paid');
END;
$$ LANGUAGE plpgsql;
