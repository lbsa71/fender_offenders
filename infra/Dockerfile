FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=20s --timeout=3s CMD node -e "fetch('http://127.0.0.1:2567/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
