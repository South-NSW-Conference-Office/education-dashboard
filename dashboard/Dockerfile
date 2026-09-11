# syntax=docker/dockerfile:1.7
#
# education-dashboard frontend (Vite SPA) — deployed to snswserver
# (linux/amd64) behind the box's shared nginx-proxy. nginx serves the static
# build and reverse-proxies /api to the backend on morpheus over Tailscale —
# the same origin split the Vite dev proxy gives locally, so the OAuth
# callback, the SSO probe and every API call stay same-origin for the browser.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
