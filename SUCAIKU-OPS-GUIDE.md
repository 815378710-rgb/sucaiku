# 🥔 sucaiku 素材兼职平台 - 完整运维手册

> **版本**: v3.0 | **最后更新**: 2026-04-27
> **用途**: 如果 AI 记忆被清空，把这份文件喂给它，就能接手所有运维工作。

---

## 一、系统总览

```
┌─────────────┐     push      ┌──────────────────┐     webhook      ┌──────────────┐
│  GitHub     │ ────────────> │  hook.maomaoxia  │ ──────────────> │  NAS :9001   │
│  代码仓库    │               │  .top (Tunnel)   │                  │  自动部署脚本  │
└─────────────┘               └──────────────────┘                  └──────┬───────┘
                                                                            │
                                                                            ▼
┌─────────────┐     访问      ┌──────────────────┐     请求转发     ┌──────────────┐
│  用户浏览器  │ <───────────> │  work.maomaoxia  │ <─────────────  │  NAS :3456   │
│             │               │  .top (Tunnel)   │                  │  sucaiku服务  │
└─────────────┘               └──────────────────┘                  └──────────────┘
```

**一句话说明**：GitHub 管代码，NAS 管运行，Cloudflare Tunnel 管外网访问，webhook 管自动更新。

---

## 二、硬件与网络

| 项目 | 值 |
|------|-----|
| NAS 型号 | Synology DS220+ (x86_64, DSM 7.3.2) |
| NAS 内网 IP | 192.168.68.161 |
| SSH 端口 | 22 |
| SSH 用户 | maomaoxia（administrators 群组） |
| SSH 密码 | CongShaoYu102@ |
| 路由器 | 京东云路由器，内网网段 192.168.68.x |
| 公网 IP | 27.212.101.41（但运营商封锁了入站端口，不能用） |

**SSH 连接方式**：
```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.68.161", username="maomaoxia", password="CongShaoYu102@")
```

**NAS 上的 Docker 命令**（必须用绝对路径 + sudo）：
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
```

---

## 三、域名与 DNS

| 项目 | 值 |
|------|-----|
| 域名 | maomaoxia.top |
| DNS 托管 | Cloudflare（2026-04-27 从阿里云迁移） |
| NS 服务器 | jamie.ns.cloudflare.com / ram.ns.cloudflare.com |
| Cloudflare 账号 ID | 4a49c0516c66297c2ee8fe9acb7ab7b9 |

### 子域名

| 域名 | 指向 | 用途 |
|------|------|------|
| work.maomaoxia.top | NAS:3456（通过 Tunnel） | sucaiku 网站 |
| hook.maomaoxia.top | NAS:9001（通过 Tunnel） | GitHub Webhook 自动部署 |
| todo.maomaoxia.top | 已弃用 | 旧 todo 服务 |

### Cloudflare Tunnel

| 项目 | 值 |
|------|-----|
| Tunnel 名称 | nas-tunnel |
| Tunnel ID | 50d16e0a-ec19-444f-a490-f97204a16bdb |
| 容器名 | cloudflared |
| 网络模式 | --network host |

**Tunnel 管理入口**：https://one.dash.cloudflare.com/ → Networks → Tunnels → nas-tunnel

**Tunnel 配置的两个 hostname**：
1. work.maomaoxia.top → http://192.168.68.161:3456
2. hook.maomaoxia.top → http://192.168.68.161:9001

---

## 四、sucaiku 项目详情

### 4.1 基本信息

| 项目 | 值 |
|------|-----|
| GitHub 仓库 | 815378710-rgb/sucaiku（private） |
| 技术栈 | Node.js Express + better-sqlite3 + 静态 HTML/CSS/JS 前端 |
| 版本 | v3.0.0 |
| 管理员密码 | admin123（可修改） |
| 管理后台 | https://work.maomaoxia.top/admin |

### 4.2 NAS 上的文件路径

| 路径 | 说明 |
|------|------|
| `/volume1/projects/sucaiku/` | 项目代码目录 |
| `/volume1/projects/sucaiku/server.js` | 后端服务（**本地维护，不从 GitHub 覆盖**） |
| `/volume1/projects/sucaiku/package.json` | 依赖配置（本地维护） |
| `/volume1/projects/sucaiku/Dockerfile` | 容器构建文件（本地维护） |
| `/volume1/projects/sucaiku/docker-compose.yml` | Docker 编排文件（本地维护） |
| `/volume1/projects/sucaiku/auto-deploy.py` | 自动部署脚本（本地维护） |
| `/volume1/projects/sucaiku/webhook-listener.py` | Webhook 接收服务（本地维护） |
| `/volume1/projects/sucaiku/public/` | 前端网页文件（**从 GitHub 同步**） |
| `/volume1/docker/sucaiku/data/` | 数据目录（Docker Volume 挂载，**永远不动**） |
| `/volume1/docker/sucaiku/data/sucaiku.db` | SQLite 数据库（用户、素材、订单） |
| `/volume1/docker/sucaiku/data/uploads/` | 用户上传的图片 |
| `/volume1/docker/sucaiku/data/backups/` | 数据库备份目录 |

### 4.3 Docker 容器

| 容器名 | 端口 | 说明 |
|--------|------|------|
| sucaiku-app | 3456 | 素材库主服务 |
| cloudflared | - | Cloudflare Tunnel 隧道 |

**容器挂载关系**：
```
/volume1/projects/sucaiku/public → 容器内 /app/public  (网页文件)
/volume1/docker/sucaiku/data     → 容器内 /app/data    (数据目录)
```

### 4.4 数据库结构（SQLite）

```
users            — 用户表（昵称、微信号、收款码、订单统计）
materials        — 素材表（平台、类型、标题、文案、图片、赏金、状态）
orders           — 订单表（素材ID、用户ID、接单/提交/审核/打款状态）
announcements    — 公告表
admin_tokens     — 管理员登录 token
site_config      — 站点配置（如管理员密码）
```

### 4.5 API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/materials | 素材列表 |
| GET | /api/materials/:id | 素材详情 |
| POST | /api/materials/:id/accept | 接单 |
| GET | /api/orders/my | 我的订单 |
| POST | /api/orders/:id/submit | 提交任务 |
| POST | /api/user/login | 用户登录 |
| POST | /api/user/register | 用户注册 |
| GET | /api/user/:id | 用户信息 |
| GET | /api/announcements | 公告列表 |
| GET | /api/stats | 统计数据 |
| POST | /api/upload | 上传图片 |
| POST | /api/admin/login | 管理员登录 |
| GET | /api/admin/materials | 管理素材列表 |
| POST | /api/admin/materials | 添加素材 |
| PUT | /api/admin/materials/:id | 编辑素材 |
| POST | /api/admin/materials/:id/archive | 归档素材 |
| GET | /api/admin/orders | 管理订单列表 |
| POST | /api/admin/orders/:id/review | 审核订单 |
| POST | /api/admin/orders/:id/pay | 订单打款 |
| GET | /api/admin/users | 用户列表 |
| POST | /api/admin/change-password | 修改密码 |

---

## 五、自动更新链路

```
GitHub push
    ↓
https://hook.maomaoxia.top/webhook（Cloudflare Tunnel → NAS:9001）
    ↓
webhook-listener.py（验证签名，确认是合法的 GitHub 请求）
    ↓
auto-deploy.py（部署前先备份数据库）
    ↓
curl 下载 GitHub 仓库 zip 包
    ↓
Python zipfile 解压
    ↓
同步文件到 /volume1/projects/sucaiku/（跳过本地维护文件）
    ↓
docker restart sucaiku-app
    ↓
健康检查 http://localhost:3456/api/health
```

### 关键配置

| 项目 | 值 |
|------|-----|
| GitHub Webhook URL | https://hook.maomaoxia.top/webhook |
| Webhook Secret | sucaiku-webhook-secret-2026 |
| Webhook 端口 | 9001 |
| Webhook 脚本 | /volume1/projects/sucaiku/webhook-listener.py |
| 部署脚本 | /volume1/projects/sucaiku/auto-deploy.py |
| 更新方式 | GitHub archive zip → Python zipfile 解压（NAS 没有 unzip 命令） |
| 本地维护文件 | server.js, package.json, Dockerfile, docker-compose.yml, auto-deploy.py, webhook-listener.py, package-lock.json, webhook-Dockerfile |

### 数据安全

- 数据目录 `/volume1/docker/sucaiku/data/` 通过 Docker Volume 挂载，`docker restart` 不影响
- 每次部署前 auto-deploy.py 会自动备份数据库到 `data/backups/`
- 备份保留 7 天自动清理
- 恢复数据库：`cp /volume1/docker/sucaiku/data/backups/sucaiku_XXXXXXXX_XXXXXX.db /volume1/docker/sucaiku/data/sucaiku.db` 然后 `docker restart sucaiku-app`

---

## 六、常见运维操作

### 6.1 查看 Docker 容器状态
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps
```

### 6.2 重启 sucaiku 服务
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
```

### 6.3 重启 cloudflared 隧道
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart cloudflared
```

### 6.4 手动执行部署（不通过 GitHub push）
```bash
cd /volume1/projects/sucaiku && python3 auto-deploy.py
```

### 6.5 查看部署日志
```bash
cat /volume1/docker/sucaiku/data/deploy.log | tail -20
```

### 6.6 查看 cloudflared 日志
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker logs cloudflared --tail 20
```

### 6.7 检查 webhook 服务是否运行
```bash
ps aux | grep webhook-listener | grep -v grep
```

### 6.8 如果 webhook 服务挂了，重新启动
```bash
cd /volume1/projects/sucaiku && nohup python3 webhook-listener.py > /tmp/webhook.log 2>&1 &
```

### 6.9 恢复数据库备份
```bash
cp /volume1/docker/sucaiku/data/backups/sucaiku_XXXXXXXX_XXXXXX.db /volume1/docker/sucaiku/data/sucaiku.db
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
```

---

## 七、如果一切崩了，如何从零恢复

### 步骤 1：确认 NAS 能 SSH 连上
```bash
ssh maomaoxia@192.168.68.161
```

### 步骤 2：确认 Docker 容器在运行
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker ps
```
应该看到 `sucaiku-app` 和 `cloudflared` 两个容器。

### 步骤 3：如果容器没了，重新创建
```bash
cd /volume1/projects/sucaiku
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker compose up -d
```

### 步骤 4：如果 cloudflared 没了
需要去 Cloudflare 面板获取新的 tunnel token，然后重新创建容器：
```bash
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker run -d --name cloudflared --restart unless-stopped --network host cloudflare/cloudflared:latest tunnel --no-autoupdate run <TUNNEL_TOKEN>
```

### 步骤 5：如果 DNS 出问题
- 检查 Cloudflare 面板的 DNS 记录是否有 work 和 hook 的 CNAME（指向 tunnel）
- 检查域名 NS 是否还是 jamie.ns.cloudflare.com / ram.ns.cloudflare.com

### 步骤 6：如果代码没了
```bash
cd /volume1/projects/sucaiku && python3 auto-deploy.py
```
会从 GitHub 重新下载所有代码。

### 步骤 7：如果数据丢了
从备份恢复：
```bash
ls /volume1/docker/sucaiku/data/backups/
cp /volume1/docker/sucaiku/data/backups/最新的备份.db /volume1/docker/sucaiku/data/sucaiku.db
echo 'CongShaoYu102@' | sudo -S -p '' /usr/local/bin/docker restart sucaiku-app
```

---

## 八、历史记录

| 日期 | 事件 |
|------|------|
| 2026-04-20 | 首次与 AI 打招呼 |
| 2026-04-27 | 从阿里云迁移 DNS 到 Cloudflare |
| 2026-04-27 | 创建 Cloudflare Tunnel nas-tunnel |
| 2026-04-27 | 配置 GitHub Webhook 自动部署 |
| 2026-04-27 | 弃用 todo-app |
| 2026-04-27 | 旧版 Supabase 数据未迁移，SQLite 为全新空库 |
