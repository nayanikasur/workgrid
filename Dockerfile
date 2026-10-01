# syntax=docker/dockerfile:1
# One Dockerfile, two images:
#   docker build --target api -t workgrid-api .
#   docker build --target web -t workgrid-web .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @workgrid/api build && pnpm --filter @workgrid/web build
# Self-contained API directory with production dependencies only.
RUN pnpm --filter @workgrid/api deploy --prod /out/api

FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /out/api/dist ./dist
COPY --from=build /out/api/package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
