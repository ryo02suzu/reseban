# syntax=docker/dockerfile:1
# レセ番 本番イメージ（Next.js standalone）
# 公式 Node イメージの AWS ECR Public ミラー（Docker Hub の回数制限を避ける）
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
# 運営者の招待リンクを発行するスクリプト用（docker compose exec app node scripts/create-operator.mjs）
# drizzle-orm はアプリ側では bundle 済みのため、スクリプトのマイグレーション用に別途入れる
COPY --from=build --chown=app:app /app/scripts/create-operator.mjs ./scripts/create-operator.mjs
COPY --from=build --chown=app:app /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
