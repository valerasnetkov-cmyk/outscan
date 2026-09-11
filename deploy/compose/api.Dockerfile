# Local, unexposed API baseline. Not a scanner isolation image.
FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build
WORKDIR /build
RUN npm install --global pnpm@11.19.0 --ignore-scripts
ENV CI=true
ENV npm_config_ignore_scripts=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/capabilities/package.json packages/capabilities/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps/api/tsconfig*.json apps/api/
COPY apps/api/src apps/api/src
COPY packages/capabilities/tsconfig*.json packages/capabilities/
COPY packages/capabilities/src packages/capabilities/src
RUN pnpm --filter @outscan/api build

FROM build AS production-dependencies
WORKDIR /runtime
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/capabilities/package.json packages/capabilities/package.json
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --offline

FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /runtime/node_modules ./node_modules
COPY --from=production-dependencies /runtime/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json ./apps/api/package.json
COPY packages/capabilities/package.json ./packages/capabilities/package.json
COPY --from=build /build/apps/api/dist ./apps/api/dist
COPY --from=build /build/packages/capabilities/dist ./packages/capabilities/dist
COPY deploy/compose/api-smoke.mjs ./container-smoke.mjs
COPY deploy/compose/scanner-smoke.mjs ./scanner-smoke.mjs
USER 1000:1000
CMD ["node", "apps/api/dist/server.js"]
