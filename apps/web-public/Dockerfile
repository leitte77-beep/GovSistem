FROM node:26-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
ARG NEXT_PUBLIC_ADMIN_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# jsdom reads this stylesheet at runtime using a path relative to the bundled
# server chunk. Next's standalone file tracer does not include that non-JS
# asset automatically, so keep it at the path expected by the bundle.
COPY --from=builder /app/node_modules/isomorphic-dompurify/node_modules/jsdom/lib/jsdom/browser/default-stylesheet.css ./browser/default-stylesheet.css
# css-tree loads these JSON dictionaries through createRequire(), which is not
# visible to Next's standalone tracer.
COPY --from=builder /app/node_modules/css-tree/data ./node_modules/css-tree/data
COPY --from=builder /app/node_modules/mdn-data/css ./node_modules/mdn-data/css
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
