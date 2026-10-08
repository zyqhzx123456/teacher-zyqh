# 多阶段构建：阶段1 打包前端，阶段2 运行后端（含前端静态托管）
FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
COPY --from=build /app/server ./server
COPY --from=build /app/server.js ./server.js
EXPOSE 3001
CMD ["node", "server.js"]
