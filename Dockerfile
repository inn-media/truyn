FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY adapters ./adapters
COPY core ./core
COPY network ./network
COPY node ./node
COPY observability ./observability
COPY runtime ./runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV TRUYN_OBSERVABILITY=1
ENV TRUYN_METRICS_HOST=127.0.0.1
ENV TRUYN_METRICS_PORT=9464

EXPOSE 8080

CMD ["node", "runtime/production.js"]
