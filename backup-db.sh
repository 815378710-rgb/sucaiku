#!/bin/bash
# sucaiku 数据库每日自动备份
# 保留最近7天备份

BACKUP_DIR="/volume1/docker/sucaiku/data/backups"
DB_FILE="/volume1/docker/sucaiku/data/sucaiku.db"
DATE=$(date +%Y%m%d_%H%M%S)

# 备份数据库
cp "$DB_FILE" "$BACKUP_DIR/sucaiku_$DATE.db"

# 删除7天前的备份
find "$BACKUP_DIR" -name "sucaiku_*.db" -mtime +7 -delete

echo "[$DATE] Backup done" >> "$BACKUP_DIR/backup.log"

