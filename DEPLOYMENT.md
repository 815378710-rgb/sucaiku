# SUCAIKU 部署与运维指南

> **版本**: v3.1.2  
> **更新日期**: 2026-04-28  
> **适用项目**: sucaiku (素材兼职平台) + copy-board (小红书文案服务)

---

## 一、项目概述

本项目由**两个完全独立的服务**组成，通过反向代理在同一域名下对外提供服务：

| 服务 | 技术栈 | 端口 | 访问路径 | 代码仓库 |
|------|--------|------|----------|----------|
| **sucaiku** | Node.js + Express | 3456 | `/` | `815378710-rgb/sucaiku` |
| **copy-board** | Python 3 + http.server | 8899 | `/zhongcao` | `815378710-rgb/copy-board` |

**核心业务流程**：
```
用户注册/登录 → 浏览素材 → 接单 → 复制文案保存图片 → 去平台发布 → 提交帖子链接 → 管理员审核 → 打款结算
```

---

## 二、系统架构

```
用户浏览器
    ↓ HTTPS
work.maomaoxia.top (Cloudflare Tunnel)
    ↓
NAS (192.168.68.161)
    ├── cloudflared 容器 (Tunnel 入口)
    ├── nginx-proxy 容器 (80/443)
    └── sucaiku-app 容器 (host网络:3456)
            ├── / → 素材兼职平台 (public/)
            ├── /zhongcao → 反向代理 → copy-board (127.0.0.1:8899)
            └── /api/* → REST API
    └── copy-board (宿主机直接运行, 8899)
```

---

## 三、首次部署

### 3.1 环境准备

- **NAS**: Synology DSM 7.x，已安装 Docker
- **域名**: maomaoxia.top，DNS 托管在 Cloudflare
- **SSH 访问**: 用户名 `maomaoxia`，密码 `CongShaoYu102@`

### 3.2 目录结构

```bash
/volume1/projects/sucaiku/          # sucaiku 代码（GitHub同步）
/volume1/projects/copy-board/        # copy-board 代码（GitHub同步）
/volume1/docker/sucaiku/data/        # 数据目录（Docker Volume，永不删除）
```

### 3.3 部署 sucaiku

```bash
# 1. 克隆代码
cd /volume1/projects
git clone https://github.com/815378710-rgb/sucaiku.git

# 2. 创建数据目录
mkdir -p /volume1/docker/sucaiku/data/uploads
mkdir -p /volume1/docker/sucaiku/data/backups

# 3. 构建并启动容器
cd /volume1/projects/sucaiku
docker compose up -d
```

**docker-compose.yml 关键配置**：
```yaml
services:
  sucaiku-app:
    build: .
    container_name: sucaiku-app
    network_mode: host
    volumes:
      - /volume1/docker/sucaiku/data:/app/data
      - /volume1/projects/sucaiku/public:/app/public
      - /volume1/projects/sucaiku/server.js:/app/server.js  # 本地修改即时生效
    restart: unless-stopped
```

### 3.4 部署 copy-board

```bash
# 1. 克隆代码
cd /volume1/projects
git clone https://github.com/815378710-rgb/copy-board.git

# 2. 创建数据目录
mkdir -p /volume1/projects/copy-board/data

# 3. 启动服务（建议用 systemd 或 nohup 保持后台运行）
cd /volume1/projects/copy-board
nohup python3 server.py > /tmp/copy-board.log 2>&1 &
```

**建议：创建 systemd 服务**（持久化运行）：
```ini
# /etc/systemd/system/copy-board.service
[Unit]
Description=Copy Board Service
After=network.target

[Service]
Type=simple
User=maomaoxia
WorkingDirectory=/volume1/projects/copy-board
ExecStart=/usr/bin/python3 /volume1/projects/copy-board/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用：
```bash
sudo systemctl daemon-reload
sudo systemctl enable copy-board
sudo systemctl start copy-board
```

### 3.5 配置 Cloudflare Tunnel

1. 登录 Cloudflare Zero Trust 面板
2. 创建 Tunnel（名称：`nas-tunnel`）
3. 添加 Public Hostname：
   - `work.maomaoxia.top` → `http://localhost:3456`
   - `hook.maomaoxia.top` → `http://localhost:9001`（如需要 Webhook）
4. 复制 tunnel token，在 NAS 上运行：
```bash
docker run -d --name cloudflared --network host cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <YOUR_TOKEN>
```

---

## 四、自动部署（GitHub Webhook）

### 4.1 配置 GitHub Webhook

1. 进入 GitHub Repo → Settings → Webhooks → Add webhook
2. **Payload URL**: `https://hook.maomaoxia.top/webhook`
3. **Content type**: `application/json`
4. **Secret**: `sucaiku-webhook-secret-2026`
5. **Events**: Just the push event

### 4.2 NAS 端 Webhook 接收器

代码位于 `/volume1/projects/sucaiku/webhook-listener.py`，监听 `0.0.0.0:9001`。

启动方式：
```bash
cd /volume1/projects/sucaiku
nohup python3 webhook-listener.py > /tmp/webhook.log 2>&1 &
```

### 4.3 部署流程

```
GitHub push
    ↓
webhook-listener.py（验证签名）
    ↓
auto-deploy.py
    ├── 备份数据库（data/backups/）
    ├── 下载 GitHub zip 并解压
    ├── 同步文件到 /volume1/projects/sucaiku/（跳过本地维护文件）
    └── docker restart sucaiku-app
```

**本地维护文件**（GitHub 同步时跳过，保留 NAS 本地修改）：
- `server.js`
- `package.json`
- `Dockerfile`
- `docker-compose.yml`
- `auto-deploy.py`
- `webhook-listener.py`
- `webhook-Dockerfile`
- `package-lock.json`

---

## 五、数据库说明

### 5.1 sucaiku 数据库

- **类型**: JSON 文件（`data/db.json`）
- **结构**:
  ```json
  {
    "materials": [],      // 素材列表
    "orders": [],         // 订单列表
    "users": [],          // 用户列表
    "announcements": [],  // 公告列表
    "adminPassword": "...", // PBKDF2 哈希密码
    "adminTokens": [],    // 管理员登录 Token
    "stats": {            // 统计数据
      "totalOrders": 0,
      "totalUsers": 0,
      "totalPaid": 0
    }
  }
  ```

### 5.2 copy-board 数据库

- **类型**: JSON 文件（`data/items.json`）
- **结构**: 文案条目数组

---

## 六、关键 API 端点

### sucaiku API

| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/health` | 健康检查 | 否 |
| GET | `/api/materials` | 获取素材列表 | 否 |
| POST | `/api/materials/:id/accept` | 接单 | 否（需userId） |
| POST | `/api/orders/:id/submit` | 提交帖子链接 | 否 |
| GET | `/api/orders/my?userId=` | 我的订单 | 否 |
| POST | `/api/user/register` | 注册/更新用户 | 否 |
| POST | `/api/user/login` | 微信号登录 | 否 |
| POST | `/api/upload` | 通用文件上传 | 否 |
| POST | `/api/admin/login` | 管理员登录 | 否 |
| GET | `/api/admin/orders` | 订单管理 | 需 Token |
| POST | `/api/admin/orders/:id/review` | 审核订单 | 需 Token |
| POST | `/api/admin/orders/:id/pay` | 标记打款 | 需 Token |
| GET | `/api/admin/materials` | 素材管理 | 需 Token |
| POST | `/api/admin/materials` | 发布素材 | 需 Token |
| DELETE | `/api/admin/users/:id` | 删除用户 | 需 Token |

### copy-board API

| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| GET | `/zhongcao/` | 前端展示页 | 否 |
| GET | `/zhongcao/admin` | 管理后台 | 否（需密码） |
| GET | `/zhongcao/api/items` | 获取所有文案 | 否 |
| GET | `/zhongcao/api/random` | 随机获取一条文案 | 否 |
| POST | `/zhongcao/api/login` | 管理员登录 | 否 |
| POST | `/zhongcao/api/items` | 新增文案 | 需 Token |
| PUT | `/zhongcao/api/items/:id` | 编辑文案 | 需 Token |
| DELETE | `/zhongcao/api/items/:id` | 删除文案 | 需 Token |
| POST | `/zhongcao/api/use/:id` | 使用（销毁）文案 | 否 |

---

## 七、运维命令速查

```bash
# === Docker ===
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker logs sucaiku-app --tail 50

# === 手动部署 ===
cd /volume1/projects/sucaiku && python3 auto-deploy.py

# === copy-board ===
ps aux | grep copy-board | grep -v grep
# 重启 copy-board
pkill -f "python3 server.py"
cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &

# === 查看日志 ===
cat /volume1/docker/sucaiku/data/deploy.log | tail -20
cat /tmp/copy-board.log | tail -20
cat /tmp/webhook.log | tail -20

# === 数据库备份 ===
cp /volume1/docker/sucaiku/data/db.json /volume1/docker/sucaiku/data/backups/db_$(date +%Y%m%d_%H%M%S).json

# === 健康检查 ===
curl http://localhost:3456/api/health
curl http://localhost:8899/api/items
```

---

## 八、安全配置

### 8.1 管理员密码

- **初始密码**: `admin123`
- **哈希算法**: PBKDF2 (100000 iterations, SHA256)
- **修改方式**: 直接修改 `data/db.json` 中的 `adminPassword` 字段，或使用以下 Node.js 脚本生成新哈希：

```javascript
const crypto = require('crypto');
const PASSWORD_SALT = 'sucaiku_v3_salt_2026';
const hash = crypto.pbkdf2Sync('新密码', PASSWORD_SALT, 100000, 32, 'sha256').toString('hex');
console.log(hash);
```

### 8.2 文件上传限制

- **最大文件大小**: 10MB
- **允许格式**: jpeg, jpg, png, gif, webp
- **存储路径**: `/app/public/uploads/`

---

## 九、已知问题与排查

### 问题 1: `/zhongcao` POST 请求超时

**原因**: Express 的 `express.json()` 中间件会消费请求 body 流，导致 `req.pipe()` 无法转发数据。

**解决**: `/zhongcao` 反向代理路由必须放在 `express.json()` 之前。当前代码已修复，见 `server.js` 第 88-106 行。

### 问题 2: server.js 修改后不生效

**原因**: Docker 镜像内缓存了旧版 `server.js`。

**解决**: 已通过 Docker volume mount 将宿主机 `server.js` 挂载到容器内，修改后只需 `docker restart sucaiku-app`。

### 问题 3: copy-board 重启后进程未启动

**原因**: copy-board 以宿主机进程运行，非 Docker 容器，NAS 重启后不会自动启动。

**解决**: 配置 systemd 服务（见 3.4 节），或手动启动：
```bash
cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &
```

### 问题 4: 数据库文件损坏

**原因**: 写入过程中进程崩溃。

**解决**: 已实现原子写入（临时文件 + rename），且损坏时自动备份并重建。

---

## 十、更新历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v3.1.2 | 2026-04-28 | 原子文件写入、删除用户端点、PBKDF2 密码哈希 |
| v3.1.1 | 2026-04-28 | 安全与稳定性修复 |
| v3.1.0 | 2026-04-28 | 修复二维码显示、添加上传/登录/健康检查端点 |
| v3.0.0 | 2026-04-27 | 初始版本 |

---

## 十一、联系与支持

- **GitHub**: `815378710-rgb/sucaiku` (private)
- **域名**: `work.maomaoxia.top`
- **NAS IP**: `192.168.68.161`

---

_本文档由 AI 自动生成，如有疑问请联系管理员更新。_
