# Ludo 3D game server (Colyseus). Build from the repository root:
#   docker build -f apps/game-server/Dockerfile -t ludo3d-game-server .
# Run (example):
#   docker run -p 2567:2567 -e GUEST_TOKEN_SECRET=... -e CORS_ORIGINS=https://play.example.com ludo3d-game-server

FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/game-server/package.json apps/game-server/
RUN pnpm install --frozen-lockfile --filter @ludo3d/game-server...
COPY packages/shared packages/shared
COPY apps/game-server apps/game-server
RUN pnpm --filter @ludo3d/game-server build \
 && pnpm --filter @ludo3d/game-server deploy --prod --legacy /out \
 && cp -r apps/game-server/dist /out/dist

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]
