# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first so this layer is cached between source changes.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# KULTR_BASE lets you serve from a sub-path, e.g. https://example.com/kultr/
ARG KULTR_BASE=/
ENV KULTR_BASE=${KULTR_BASE}

# Optionally bake a server address into the build so the login screen is
# pre-filled (VITE_LOCK_SERVER=1 hides the field entirely).
ARG VITE_NAVIDROME_URL=""
ARG VITE_LOCK_SERVER=""
ENV VITE_NAVIDROME_URL=${VITE_NAVIDROME_URL}
ENV VITE_LOCK_SERVER=${VITE_LOCK_SERVER}

RUN npm run build


# -------------------------------------------------------------- runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4180
ENV HOST=0.0.0.0

# Only the built app and the tiny static server are needed at runtime — no
# node_modules, no nginx, nothing to patch.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

RUN addgroup -S kultr && adduser -S kultr -G kultr && chown -R kultr:kultr /app
USER kultr

EXPOSE 4180

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4180)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/serve.js"]
