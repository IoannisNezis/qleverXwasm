# Build the site with Node, then serve the static output with nginx.

FROM node:24-alpine AS build

WORKDIR /app

# Copy the manifests first so the install layer is reused while only src changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

RUN npm run build

# Store a gzipped copy next to every compressible asset. nginx's `gzip_static`
# then serves it directly, which matters most for the ~60 MB engine `.wasm`:
# compressing that per request would burn a second of CPU each time.
RUN set -eux; \
    find dist -type f \
        \( -name '*.js'   -o -name '*.mjs'  -o -name '*.css'  -o -name '*.html' \
        -o -name '*.wasm' -o -name '*.svg'  -o -name '*.json' -o -name '*.map' \) \
        -size +1k \
        -exec sh -c 'for f do gzip -9 -c "$f" > "$f.gz"; done' sh {} +


FROM nginx:1.29-alpine AS runtime

COPY docker/nginx/cross-origin-isolation.conf /etc/nginx/snippets/
COPY docker/nginx/default.conf               /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --spider -q http://127.0.0.1/healthz || exit 1

# Build and run:
#   docker build -t qlever-wasm .
#   docker run --rm -p 8080:80 qlever-wasm
# then open http://localhost:8080/
