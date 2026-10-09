FROM oven/bun:1

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun . .

USER bun

CMD ["bun", "src/index.ts"]