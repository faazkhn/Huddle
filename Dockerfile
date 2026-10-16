# Relay + phone web page in one container (EC2 / Lightsail / ECS). Put TLS in front (Caddy or an ALB) — phones need HTTPS.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
COPY apps/phone ./apps/phone
COPY fixtures/synth.ts ./fixtures/synth.ts
RUN npm ci --workspaces --include-workspace-root=false --ignore-scripts && npm run build -w apps/phone

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
EXPOSE 8080
USER node
CMD ["node", "services/relay/src/index.ts"]
