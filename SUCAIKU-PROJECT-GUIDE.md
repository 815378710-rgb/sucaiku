# SUCAIKU 项目完整运维指南

> **本文档目的**: 让任何接手该项目的人（包括后续AI）能在10分钟内完全理解系统并独立操作。  
> **版本**: v3.1.3  
> **最后更新**: 2026-04-29  
> **作者**: AI助手  
> **项目 owner**: 老大（西安）

---

## 一、项目总览（必看）

本项目由**两个完全独立的服务**组成，部署在同一台NAS上，通过反向代理在同一域名下对外提供服务：

| 服务 | 技术栈 | 内部端口 | 外部访问 | 代码仓库 | 当前版本 |
|------|--------|----------|----------|----------|----------|
| **sucaiku** | Node.js 18 + Express 4 | 3456 | `work.maomaoxia.top` | `815378710-rgb/sucaiku` | v3.1.2 |
| **copy-board** | Python 3 + http.server | 8899 | `work.maomaoxia.top/zhongcao` | `815378710-rgb/copy-board` | v3.1.2 |

**sucaiku** = 素材兼职平台（用户接单、发布、结算）  
**copy-board** = 小红书文案服务（前台展示文案、后台管理文案）

### 核心业务流程
```
用户微信打开 work.maomaoxia.top
    → 注册/登录（昵称+微信号+收款码）
    → 浏览素材列表
    → 接单（复制文案、保存图片）
    → 去小红书/抖音发布帖子
    → 回到网站提交帖子链接
    → 管理员审核通过
    → 管理员标记打款
    → 用户私聊管理员收款
```

### 中草（copy-board）业务流程
```
用户打开 work.maomaoxia.top/zhongcao
    → 随机获取一条小红书文案
    → 复制标题 → 复制正文（自动附带店铺位置）
    → 去小红书发帖
    → 文案标记为已使用（从库中移除）
```

---

## 二、硬件与网络环境

### NAS 信息
| 项目 | 值 |
|------|-----|
| 型号 | Synology DS220+ (x86_64) |
| DSM 版本 | 7.3.2 |
| 内网 IP | 192.168.68.161 |
| SSH 用户 | maomaoxia（administrators 组） |
| SSH 密码 | `CongShaoYu102@` |
| 路由器 | 京东云路由器，网段 192.168.68.x |
| 公网 IP | 27.212.101.41（运营商封锁入站端口，不可用） |

### 域名与 DNS
| 项目 | 值 |
|------|-----|
| 域名 | maomaoxia.top |
| DNS 托管 | Cloudflare |
| NS 服务器 | jamie.ns.cloudflare.com / ram.ns.cloudflare.com |
| Cloudflare 账号 ID | 4a49c0516c66297c2ee8fe9acb7ab7b9 |

### 子域名映射（Cloudflare Tunnel）
| 子域名 | Tunnel 指向 | 用途 |
|--------|-------------|------|
| work.maomaoxia.top | NAS:3456 | sucaiku 主站 |
| hook.maomaoxia.top | NAS:9001 | GitHub Webhook 自动部署 |

- **Tunnel 名称**: nas-tunnel
- **Tunnel ID**: 50d16e0a-ec19-444f-a490-f97204a16bdb
- **容器**: cloudflared（--network host）

---

## 三、NAS 文件路径（重要）

### sucaiku 项目
```
/volume1/projects/sucaiku/
├── server.js              # 后端主文件（本地维护，GitHub同步时跳过）
├── package.json           # 依赖配置（本地维护）
├── docker-compose.yml     # Docker配置（本地维护）
├── Dockerfile             # 本地维护
├── auto-deploy.py         # 自动部署脚本（本地维护）
├── webhook-listener.py    # Webhook接收器（本地维护）
├── webhook-Dockerfile     # 本地维护
├── public/                # 前端文件（从GitHub同步）
│   ├── index.html         # 首页
│   ├── detail.html        # 素材详情
│   ├── orders.html        # 我的订单
│   ├── admin.html         # 管理后台
│   ├── css/
│   └── js/
└── data/                  # 数据目录（Docker Volume挂载，永不删除）
    └── db.json            # SQLite数据库文件
```

### copy-board 项目
```
/volume1/projects/copy-board/
├── server.py              # 后端主文件（从GitHub同步）
├── data/                  # 数据目录
│   └── items.json         # 文案数据库
└── README.md
```

### 数据目录（Docker Volume，绝对不要删）
```
/volume1/docker/sucaiku/data/
├── db.json                # sucaiku 数据库
├── uploads/               # 用户上传图片
└── backups/               # 自动备份
```

**⚠️ 警告**: `db.json` 和 `items.json` 是核心数据，删除 = 数据全丢。

---

## 四、Docker 容器

### 当前运行的容器
```bash
# 查看容器状态
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps
```

| 容器名 | 端口 | 说明 |
|--------|------|------|
| sucaiku-app | 3456 | 素材库主服务（network_mode: host） |
| cloudflared | - | Cloudflare Tunnel（network_mode: host） |
| nginx-proxy | 80/443 | Nginx 反向代理 |

### sucaiku-app 挂载关系
```yaml
volumes:
  - /volume1/docker/sucaiku/data:/app/data        # 数据库+上传
  - /volume1/projects/sucaiku/public:/app/public    # 前端文件
  - /volume1/projects/sucaiku/server.js:/app/server.js  # 本地修改即时生效
network_mode: host
```

**为什么用 host 网络？** 因为 sucaiku 需要反向代理到 copy-board（127.0.0.1:8899），bridge 网络无法访问宿主机端口。

### copy-board 不是 Docker 容器
- copy-board 以**宿主机进程**直接运行
- 启动命令: `cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &`
- **NAS 重启后需要手动启动**（建议配置 systemd 服务实现自动启动）

---

## 五、数据库结构

### sucaiku 数据库（db.json）
```json
{
  "materials": [
    {
      "id": "uuid",
      "platform": "xiaohongshu|douyin",
      "type": "image|video|comment",
      "title": "素材标题",
      "copyText": "文案内容",
      "images": ["/uploads/xxx.jpg"],
      "reward": 5.0,
      "maxOrders": 10,
      "currentOrders": 3,
      "tags": ["tag1", "tag2"],
      "status": "active",
      "expireAt": "2026-05-01T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "orders": [
    {
      "id": "uuid",
      "materialId": "素材ID",
      "userId": "用户ID",
      "materialTitle": "素材标题",
      "platform": "xiaohongshu",
      "reward": 5.0,
      "status": "accepted|submitted|approved|rejected|paid",
      "acceptedAt": "...",
      "submittedAt": "...",
      "postUrl": "帖子链接",
      "submitNote": "备注",
      "reviewedAt": "...",
      "reviewNote": "审核备注",
      "paidAt": "..."
    }
  ],
  "users": [
    {
      "id": "uuid",
      "nickname": "昵称",
      "wechat": "微信号",
      "qrcode": "/uploads/xxx.jpg",
      "totalOrders": 0,
      "completedOrders": 0,
      "totalEarned": 0,
      "createdAt": "...",
      "lastActiveAt": "..."
    }
  ],
  "announcements": [
    {
      "id": "uuid",
      "title": "公告标题",
      "content": "公告内容",
      "pinned": true,
      "active": true,
      "createdAt": "..."
    }
  ],
  "adminPassword": "pbkdf2_hash...",
  "adminTokens": [
    {
      "token": "hex",
      "createdAt": "...",
      "expiresAt": "..."
    }
  ],
  "stats": {
    "totalOrders": 0,
    "totalUsers": 0,
    "totalPaid": 0
  }
}
```

### copy-board 数据库（items.json）
```json
[
  {
    "id": 1,
    "title": "标题",
    "content": "正文内容",
    "created_at": "2026-04-28T10:00:00"
  }
]
```

---

## 六、API 接口清单

### sucaiku 公共接口（无需认证）

| 方法 | 端点 | 说明 | 请求参数 |
|------|------|------|----------|
| GET | `/api/health` | 健康检查 | - |
| GET | `/api/materials` | 获取素材列表 | `?platform=&type=&keyword=` |
| GET | `/api/materials/:id` | 获取素材详情 | - |
| POST | `/api/materials/:id/accept` | 接单 | `{ userId }` |
| POST | `/api/orders/:id/submit` | 提交帖子链接 | `{ postUrl, note? }` |
| GET | `/api/orders/my` | 我的订单 | `?userId=` |
| POST | `/api/user/register` | 注册/更新用户 | `{ nickname, wechat?, qrcode? }` + 文件上传 |
| POST | `/api/user/login` | 微信号登录 | `{ wechat }` |
| POST | `/api/upload` | 通用文件上传 | `multipart/form-data` file |
| GET | `/api/announcements` | 获取公告 | - |
| GET | `/api/stats` | 获取统计数据 | - |

### sucaiku 管理员接口（需 X-Admin-Token）

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 `{ password }` → 返回 token |
| GET | `/api/admin/orders` | 订单列表 `?status=` |
| POST | `/api/admin/orders/:id/review` | 审核 `{ action: "approve"/"reject", note? }` |
| POST | `/api/admin/orders/:id/pay` | 标记打款 |
| GET | `/api/admin/materials` | 素材列表 |
| POST | `/api/admin/materials` | 发布素材 |
| PUT | `/api/admin/materials/:id` | 编辑素材 |
| POST | `/api/admin/materials/:id/archive` | 归档素材 |
| DELETE | `/api/admin/materials/:id` | 删除素材 |
| GET | `/api/admin/users` | 用户列表 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| POST | `/api/admin/announcements` | 发布公告 |
| GET | `/api/admin/announcements` | 公告列表 |
| DELETE | `/api/admin/announcements/:id` | 删除公告 |

### copy-board 接口

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/zhongcao/` | 前端展示页 |
| GET | `/zhongcao/admin` | 管理后台 |
| GET | `/zhongcao/api/items` | 获取所有文案 |
| GET | `/zhongcao/api/random` | 随机获取一条文案 `?exclude=` |
| POST | `/zhongcao/api/login` | 管理员登录 `{ password }` |
| POST | `/zhongcao/api/items` | 新增文案 `{ title, content }`（需X-Token） |
| PUT | `/zhongcao/api/items/:id` | 编辑文案（需X-Token） |
| DELETE | `/zhongcao/api/items/:id` | 删除文案（需X-Token） |
| POST | `/zhongcao/api/use/:id` | 标记文案已使用 |

---

## 七、首次部署完整步骤（从零开始）

### 7.1 准备环境

1. **NAS 开启 SSH**：控制面板 → 终端机和 SNMP → 启动 SSH 服务（端口 22）
2. **安装 Docker**：套件中心安装 Docker（已装则跳过）
3. **安装 Git Server**：套件中心安装 Git Server

### 7.2 部署 sucaiku

```bash
# 1. SSH 连上 NAS
ssh maomaoxia@192.168.68.161

# 2. 创建目录
mkdir -p /volume1/projects/sucaiku
mkdir -p /volume1/docker/sucaiku/data/uploads
mkdir -p /volume1/docker/sucaiku/data/backups

# 3. 下载代码（或通过 GitHub Webhook 自动部署）
cd /volume1/projects/sucaiku
curl -L https://github.com/815378710-rgb/sucaiku/archive/refs/heads/main.zip -o sucaiku.zip
unzip -o sucaiku.zip
mv sucaiku-main/* . && rm -rf sucaiku-main sucaiku.zip

# 4. 构建并启动 Docker 容器
docker compose up -d

# 5. 验证
 curl http://localhost:3456/api/health
```

### 7.3 部署 copy-board

```bash
# 1. 创建目录
mkdir -p /volume1/projects/copy-board
mkdir -p /volume1/projects/copy-board/data

# 2. 下载代码
cd /volume1/projects/copy-board
curl -L https://github.com/815378710-rgb/copy-board/archive/refs/heads/main.zip -o cb.zip
unzip -o cb.zip
mv copy-board-main/* . && rm -rf copy-board-main cb.zip

# 3. 启动服务
nohup python3 server.py > /tmp/copy-board.log 2>&1 &

# 4. 验证
 curl http://localhost:8899/api/items
```

### 7.4 配置 Cloudflare Tunnel

1. 登录 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Networks → Tunnels → Create a tunnel
3. 选择 Cloudflared → 命名 `nas-tunnel`
4. 复制安装命令中的 token（`--token` 后面的字符串）
5. 在 NAS 上运行：
```bash
docker run -d --name cloudflared --network host \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token YOUR_TOKEN
```
6. 配置 Public Hostname：
   - Subdomain: `work` → Domain: `maomaoxia.top` → Service: `http://localhost:3456`
   - （可选）Subdomain: `hook` → Service: `http://localhost:9001`

### 7.5 配置 GitHub Webhook 自动部署

1. 进入 GitHub Repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://hook.maomaoxia.top/webhook`
3. Content type: `application/json`
4. Secret: `sucaiku-webhook-secret-2026`
5. Events: Just the push event
6. 在 NAS 上启动 webhook 接收器：
```bash
cd /volume1/projects/sucaiku
nohup python3 webhook-listener.py > /tmp/webhook.log 2>&1 &
```

---

## 八、日常运维命令

### 查看状态
```bash
# Docker 容器
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps

# 服务进程
ps aux | grep -E 'python3 server.py|node server.js' | grep -v grep

# 端口监听
netstat -tlnp | grep -E '3456|8899|9001'
```

### 重启服务
```bash
# 重启 sucaiku
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app

# 重启 copy-board
pkill -f 'python3 server.py'
cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &

# 重启 cloudflared
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart cloudflared
```

### 查看日志
```bash
# sucaiku Docker 日志
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker logs sucaiku-app --tail 50

# copy-board 日志
cat /tmp/copy-board.log | tail -50

# webhook 日志
cat /tmp/webhook.log | tail -20

# 部署日志
cat /volume1/docker/sucaiku/data/deploy.log | tail -20

# cloudflared 日志
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker logs cloudflared --tail 20
```

### 手动部署（当自动部署失效时）
```bash
cd /volume1/projects/sucaiku && python3 auto-deploy.py
```

### 数据库备份与恢复
```bash
# 手动备份
cp /volume1/docker/sucaiku/data/db.json \
   /volume1/docker/sucaiku/data/backups/db_$(date +%Y%m%d_%H%M%S).json

# 恢复备份（停止服务后）
cp /volume1/docker/sucaiku/data/backups/db_XXXXXXXX_XXXXXX.json \
   /volume1/docker/sucaiku/data/db.json
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
```

---

## 九、账号与密码

| 系统 | 账号/角色 | 密码 | 备注 |
|------|-----------|------|------|
| NAS SSH | maomaoxia | `CongShaoYu102@` | 管理员权限 |
| sucaiku 管理员 | admin | `admin123` | 登录 `/admin` |
| copy-board 管理员 | admin | `admin123` | 登录 `/zhongcao/admin` |
| GitHub Webhook | - | `sucaiku-webhook-secret-2026` | 签名验证用 |

### 修改 sucaiku 管理员密码

```javascript
// 在 NAS 上运行 node 命令生成新哈希
const crypto = require('crypto');
const PASSWORD_SALT = 'sucaiku_v3_salt_2026';
const hash = crypto.pbkdf2Sync('新密码', PASSWORD_SALT, 100000, 32, 'sha256').toString('hex');
console.log(hash);
```

然后将生成的哈希替换 `db.json` 中的 `adminPassword` 字段，重启容器生效。

---

## 十、前端页面路径

### sucaiku
| 路径 | 文件 | 说明 |
|------|------|------|
| `/` | `public/index.html` | 首页（素材列表） |
| `/material/:id` | `public/detail.html` | 素材详情页 |
| `/orders` | `public/orders.html` | 我的订单 |
| `/admin` | `public/admin.html` | 管理后台 |

### copy-board
| 路径 | 说明 |
|------|------|
| `/zhongcao/` | 小红书文案展示页（用户用） |
| `/zhongcao/admin` | 文案管理后台（管理员用） |

---

## 十一、常见问题排查

### Q1: 网站打不开（502/超时）
**排查步骤**:
1. `docker ps` 确认 sucaiku-app 和 cloudflared 都在运行
2. `curl http://localhost:3456/api/health` 测试本地服务
3. `docker logs cloudflared --tail 20` 看 tunnel 是否有错误
4. 检查 Cloudflare DNS 的 CNAME 记录是否正常

### Q2: `/zhongcao` 打不开或 POST 超时
**排查步骤**:
1. `curl http://localhost:8899/api/items` 确认 copy-board 本身正常
2. `curl http://localhost:3456/zhongcao/api/items` 确认代理正常
3. 检查 `server.js` 中的 `/zhongcao` 代理是否在 `express.json()` **之前**
4. 检查 copy-board 进程是否在运行：`ps aux | grep python3`

### Q3: 修改 server.js 后不生效
**原因**: Docker 镜像内缓存了旧文件。  
**解决**: 确认 docker-compose.yml 中有 `server.js` 的 volume mount，然后 `docker restart sucaiku-app`。

### Q4: 图片上传失败
**排查**:
1. 确认 `POST /api/upload` 端点存在
2. 确认 `/app/public/uploads` 目录有写权限
3. 检查图片大小是否超过 10MB
4. 检查文件格式是否为 jpg/png/gif/webp

### Q5: 数据库文件损坏
**现象**: 服务启动报错或数据丢失。  
**解决**:
1. 从 `data/backups/` 找最新备份恢复
2. 如果没有备份，代码已内置自动重建机制（会丢失数据但服务能启动）

### Q6: copy-board NAS 重启后没启动
**原因**: copy-board 是宿主机进程，非 Docker 容器。  
**解决**: 手动启动或配置 systemd 服务：
```bash
# 手动启动
cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &

# 或配置 systemd（推荐）
# 见部署文档中的 systemd 配置
```

---

## 十二、代码更新流程

### 场景 1: 修改 sucaiku 前端（public/ 目录）
```
本地修改 → git commit → git push → Webhook 自动部署到 NAS
```
**注意**: `public/` 目录从 GitHub 同步，修改后 push 即可自动部署。

### 场景 2: 修改 sucaiku 后端（server.js）
```
本地修改 → git commit → git push（备份代码）
→ SSH 到 NAS 直接修改 /volume1/projects/sucaiku/server.js
→ docker restart sucaiku-app
```
**注意**: `server.js` 是本地维护文件，GitHub 同步时跳过。volume mount 使本地修改即时生效。

### 场景 3: 修改 copy-board（server.py）
```
本地修改 → git commit → git push（备份代码）
→ SSH 到 NAS，cd /volume1/projects/copy-board && git pull
→ pkill -f 'python3 server.py'
→ nohup python3 server.py > /tmp/copy-board.log 2>&1 &
```

### 场景 4: 没有 git 时的紧急更新
```bash
# 通过 SSH 把文件内容 base64 编码后写入
# 参考 deploy 脚本中的方法
```

---

## 十三、Windows 开发环境连接 NAS

### SSH 连接
**不要**用 Windows 自带的 `ssh.exe`（非交互式密码会卡住）。  
**必须**用 Python paramiko：

```python
import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.68.161", username="maomaoxia", password="CongShaoYu102@", timeout=15)
# 执行命令
stdin, stdout, stderr = client.exec_command("docker ps")
print(stdout.read().decode())
client.close()
```

### Python 路径
```
C:\Users\81537\AppData\Local\Programs\Python\Python311\python.exe
```

### 编码设置（PowerShell）
```powershell
$env:PYTHONIOENCODING='utf-8'
```

---

## 十四、性能与优化建议

1. **copy-board 持久化**: 配置 systemd 服务，NAS 重启后自动启动
2. **日志轮转**: 当前日志会无限增长，建议配置 logrotate
3. **数据库备份**: 当前自动备份在部署时触发，建议增加定时备份（crontab）
4. **图片压缩**: 用户上传的图片没有自动压缩，大图可能影响加载速度
5. **CDN**: 静态资源可以考虑接入 Cloudflare CDN 加速

---

## 十五、联系信息

- **项目 Owner**: 老大（西安）
- **GitHub**: `815378710-rgb/sucaiku` (private) / `815378710-rgb/copy-board` (private)
- **域名**: work.maomaoxia.top
- **NAS IP**: 192.168.68.161

---

## 附录：速查命令卡

```bash
# === 一键查看所有状态 ===
echo '=== Docker ===' && echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps && \
echo '=== Copy-Board ===' && ps aux | grep 'python3 server.py' | grep -v grep && \
echo '=== Ports ===' && netstat -tlnp 2>/dev/null | grep -E '3456|8899' && \
echo '=== Health ===' && curl -s http://localhost:3456/api/health && echo '' && \
echo '=== CB Health ===' && curl -s http://localhost:8899/api/items | head -c 30

# === 一键重启所有 ===
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app && \
pkill -f 'python3 server.py' && sleep 1 && \
cd /volume1/projects/copy-board && nohup python3 server.py > /tmp/copy-board.log 2>&1 &
```

---

_本文档应随时更新，任何修改系统配置的行为都应在此记录。_
