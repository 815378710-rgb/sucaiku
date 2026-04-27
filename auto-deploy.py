#!/usr/bin/env python3
"""
sucaiku-auto-deploy.py
自动部署脚本：从GitHub下载最新代码，重启Docker容器
项目目录已挂载到容器内，所以只需同步代码 + 重启容器，无需重建镜像！
数据不受影响（SQLite数据库在volume挂载中）
"""
import os
import sys
import subprocess
import time
import zipfile
import shutil
import urllib.request

# === 配置 ===
REPO = "815378710-rgb/sucaiku"
BRANCH = "main"
PROJECT_DIR = "/volume1/projects/sucaiku"
DATA_DIR = "/volume1/docker/sucaiku/data"
LOG_FILE = os.path.join(DATA_DIR, "deploy.log")
CONTAINER_NAME = "sucaiku-app"
DOCKER = "/usr/local/bin/docker"  # 群晖NAS上docker的绝对路径
SUDO = "echo 'CongShaoYu102@' | sudo -S -p ''"  # NAS上docker需要sudo

# 需要跳过的文件（auto-deploy.py 和 webhook-listener.py 本身不覆盖，防止部署中断）
# 其余所有文件（包括 server.js, package.json, Dockerfile 等）都从 GitHub 同步
SKIP_FILES = {"auto-deploy.py", "webhook-listener.py", "start-webhook.sh"}

IN_DOCKER = os.path.exists("/.dockerenv")

def log(msg):
    """写日志"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass

def run_cmd(cmd, timeout=60):
    """执行shell命令"""
    log(f"  > {cmd[:120]}{'...' if len(cmd)>120 else ''}")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        if result.stdout:
            for line in result.stdout.strip().split("\n")[-3:]:
                log(f"    {line}")
        if result.returncode != 0 and result.stderr:
            err = result.stderr.strip()
            if 'password' not in err.lower() and err:
                log(f"    ERR: {err[:200]}")
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        log(f"  ❌ 命令超时")
        return -1, "", "timeout"

def sync_source_files():
    """从GitHub下载仓库zip并解压"""
    log("📥 从GitHub下载最新代码...")
    
    zip_url = f"https://github.com/{REPO}/archive/refs/heads/{BRANCH}.zip"
    zip_path = os.path.join(DATA_DIR, "source.zip")
    
    code, _, _ = run_cmd(f"curl -sL --connect-timeout 15 --max-time 120 -o {zip_path} '{zip_url}'", timeout=150)
    if code != 0:
        log("  ❌ 下载失败")
        return False
    
    if not os.path.exists(zip_path) or os.path.getsize(zip_path) < 100:
        log("  ❌ 下载的文件无效")
        return False
    
    log("📦 解压代码...")
    temp_dir = os.path.join(DATA_DIR, "source_temp")
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(temp_dir)
    except Exception as e:
        log(f"  ❌ 解压失败: {e}")
        return False
    
    extracted_dirs = [d for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d))]
    if not extracted_dirs:
        log("  ❌ 解压目录为空")
        return False
    
    source_dir = os.path.join(temp_dir, extracted_dirs[0])
    
    # 只备份并恢复 skip 列表中的文件（防止部署脚本自己被覆盖中断）
    log("💾 保护部署脚本...")
    for f in SKIP_FILES:
        src = os.path.join(PROJECT_DIR, f)
        if os.path.exists(src):
            dst = os.path.join(DATA_DIR, f"_backup_{f}")
            shutil.copy2(src, dst)
    
    # 同步源码
    log("🔄 同步源码文件...")
    synced = 0
    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for fname in files:
            if fname in SKIP_FILES:
                continue
            src_file = os.path.join(root, fname)
            rel_path = os.path.relpath(src_file, source_dir)
            dst_file = os.path.join(PROJECT_DIR, rel_path)
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            try:
                shutil.copy2(src_file, dst_file)
            except (PermissionError, OSError):
                subprocess.run(f"cp '{src_file}' '{dst_file}'", shell=True, check=False, 
                             capture_output=True, timeout=10)
            synced += 1
    
    log(f"  ✅ 同步了 {synced} 个文件")
    
    # 恢复受保护的部署脚本
    for f in SKIP_FILES:
        backup = os.path.join(DATA_DIR, f"_backup_{f}")
        if os.path.exists(backup):
            dst = os.path.join(PROJECT_DIR, f)
            try:
                shutil.copy2(backup, dst)
            except (PermissionError, OSError):
                subprocess.run(f"cp '{backup}' '{dst}'", shell=True, check=False,
                             capture_output=True, timeout=10)
            os.remove(backup)
    
    # 清理临时文件
    shutil.rmtree(temp_dir)
    os.remove(zip_path)
    
    log("  ✅ 代码同步完成")
    return True

def restart_container():
    """重启Docker容器（无需重建镜像，因为项目目录已挂载）"""
    log("🔄 重启容器...")
    code, out, _ = run_cmd(f"{SUDO} {DOCKER} restart {CONTAINER_NAME}")
    if code != 0:
        log("  ⚠️ restart失败，尝试直接启动...")
        code, _, _ = run_cmd(f"{SUDO} {DOCKER} start {CONTAINER_NAME}")
        if code != 0:
            log("  ❌ 启动失败！")
            return False
    
    log("  ✅ 容器已重启")
    return True

def health_check():
    """健康检查"""
    log("🏥 健康检查...")
    for i in range(10):
        time.sleep(2)
        try:
            req = urllib.request.Request("http://localhost:3456/api/health")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode())
                    log(f"  ✅ 服务正常运行！(版本: {data.get('version', 'unknown')})")
                    return True
        except:
            pass
        log(f"  等待启动... ({i+1}/10)")
    log("  ⚠️ 健康检查超时")
    return False

def main():
    import json as json_mod
    global json
    json = json_mod
    
    log("=" * 50)
    log("🚀 sucaiku 自动部署开始")
    log(f"   运行环境: {'Docker容器内' if IN_DOCKER else 'NAS本机'}")
    log("=" * 50)
    
    if not os.path.exists(DATA_DIR):
        log(f"❌ 数据目录不存在: {DATA_DIR}")
        sys.exit(1)
    
    if not sync_source_files():
        log("❌ 代码同步失败")
        sys.exit(1)
    
    if not restart_container():
        log("❌ 容器重启失败！")
        sys.exit(1)
    
    health_check()
    
    log("=" * 50)
    log("✅ 自动部署完成！")
    log("=" * 50)

if __name__ == "__main__":
    main()
