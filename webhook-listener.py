#!/usr/bin/env python3
"""
sucaiku-webhook-listener.py
轻量Webhook监听服务：接收GitHub Webhook，通过NAS本机Python3执行部署
"""
import http.server
import json
import subprocess
import hashlib
import hmac
import os
import sys
import threading
import time

# === 配置 ===
PORT = 9001
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "sucaiku-webhook-secret-2026")
NAS_PYTHON = "/usr/bin/python3"  # NAS本机Python3
NAS_DEPLOY_SCRIPT = "/volume1/projects/sucaiku/auto-deploy.py"

# 部署锁
deploy_lock = threading.Lock()
last_deploy_time = 0
DEPLOY_COOLDOWN = 60

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)

def verify_signature(body, signature):
    if not signature:
        return True  # 开发模式
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

def run_deploy():
    """通过NAS本机Python3执行部署（不在容器内，解决网络问题）"""
    global last_deploy_time
    
    with deploy_lock:
        now = time.time()
        if now - last_deploy_time < DEPLOY_COOLDOWN:
            remaining = int(DEPLOY_COOLDOWN - (now - last_deploy_time))
            log(f"⏳ 冷却中，{remaining}秒后可再次部署")
            return
        
        last_deploy_time = now
        log("🚀 触发自动部署（NAS本机执行）...")
        try:
            result = subprocess.run(
                [NAS_PYTHON, NAS_DEPLOY_SCRIPT],
                capture_output=True, text=True, timeout=600
            )
            if result.returncode == 0:
                log("✅ 自动部署成功！")
            else:
                log(f"❌ 自动部署失败，返回码: {result.returncode}")
                if result.stderr:
                    log(f"  错误: {result.stderr[:300]}")
        except subprocess.TimeoutExpired:
            log("❌ 部署超时（10分钟）")
        except Exception as e:
            log(f"❌ 部署异常: {e}")

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return
        
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(body, signature):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Invalid signature")
            return
        
        event = self.headers.get("X-GitHub-Event", "")
        try:
            payload = json.loads(body)
        except:
            self.send_response(400)
            self.end_headers()
            return
        
        if event == "push":
            ref = payload.get("ref", "")
            repo = payload.get("repository", {}).get("full_name", "")
            pusher = payload.get("pusher", {}).get("name", "unknown")
            commits = len(payload.get("commits", []))
            
            log(f"📥 push: {repo} {ref} by {pusher} ({commits} commits)")
            
            if ref == "refs/heads/main" and repo == "815378710-rgb/sucaiku":
                threading.Thread(target=run_deploy, daemon=True).start()
                self.send_response(200)
                self.end_headers()
                self.write_json({"status": "deploy_triggered"})
                log("🎯 已触发自动部署")
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Ignored")
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Ignored")
    
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
        elif self.path == "/trigger-deploy":
            log("👆 手动触发部署")
            threading.Thread(target=run_deploy, daemon=True).start()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Deploy triggered manually")
        elif self.path == "/status":
            self.write_json({"service": "sucaiku-webhook", "status": "running"})
        elif self.path == "/deploy-log":
            self.send_response(200)
            self.headers["Content-Type"] = "text/plain; charset=utf-8"
            self.end_headers()
            try:
                with open("/volume1/docker/sucaiku/data/deploy.log", "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    self.wfile.write("".join(lines[-50:]).encode())
            except:
                self.wfile.write(b"No logs yet")
        else:
            self.send_response(404)
            self.end_headers()
    
    def write_json(self, data):
        self.send_response(200)
        self.headers["Content-Type"] = "application/json"
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, format, *args):
        pass

def main():
    log(f"🌐 sucaiku Webhook监听服务启动 (端口: {PORT})")
    log(f"   部署脚本: {NAS_PYTHON} {NAS_DEPLOY_SCRIPT}")
    server = http.server.HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()

if __name__ == "__main__":
    main()
