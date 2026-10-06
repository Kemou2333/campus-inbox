# Optional transport for a future server move. Production currently uses systemd.
FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -p /var/lib/campus-inbox && chown node:node /var/lib/campus-inbox && chmod 700 /var/lib/campus-inbox
COPY server/index.mjs server/analyze.mjs server/service.mjs server/auth.mjs server/sync.mjs server/manage-invites.mjs ./server/
COPY server/contracts/ ./server/contracts/
COPY worker/prompt.mjs ./worker/prompt.mjs
USER node
ENV PORT=8787 BIND_HOST=0.0.0.0 USAGE_STATE_FILE=/var/lib/campus-inbox/usage.json
EXPOSE 8787
CMD ["node", "server/index.mjs"]
