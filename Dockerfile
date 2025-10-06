# 多阶段构建，生成更小的生产镜像
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制包管理文件
COPY package.json package-lock.json ./

# 安装所有依赖
RUN npm install

# 复制源代码
COPY . .

# 构建应用程序
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

# 设置工作目录
WORKDIR /app

# 安装运行时依赖
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --only=production || npm i --omit=dev

# 从构建阶段复制构建好的应用程序
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js

# 暴露端口
EXPOSE 3000

# 启动应用程序
CMD ["node", "server.js"]
