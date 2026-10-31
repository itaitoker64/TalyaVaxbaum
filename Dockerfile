# Single container: API + built web app. Mount a persistent volume at /data.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
EXPOSE 8787
VOLUME ["/data"]
CMD ["npx", "tsx", "server/index.ts"]
