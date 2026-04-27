FROM node:18-alpine

# better-sqlite3 需要编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

# 数据目录由 volume 挂载，不包含在镜像中
VOLUME /app/data

EXPOSE 3456
CMD ["node", "server.js"]
