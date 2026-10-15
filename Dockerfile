FROM node:24-alpine AS build
ARG APP_BASE_PATH=
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend frontend
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend backend
COPY --from=build --chown=node:node /app/frontend/dist frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT || 3000) + (process.env.APP_BASE_PATH === '/' ? '' : process.env.APP_BASE_PATH || '') + '/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend/src/server.js"]
