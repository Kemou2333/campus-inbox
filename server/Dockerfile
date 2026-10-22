# Optional transport for a future server move. Production currently uses systemd.
FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -p /var/lib/campus-inbox && chown node:node /var/lib/campus-inbox && chmod 700 /var/lib/campus-inbox
COPY server/site-transfer.mjs server/index.mjs server/analyze.mjs server/service.mjs server/image-captcha.mjs server/auth.mjs server/sync.mjs server/manage-invites.mjs ./server/
COPY server/admin.mjs server/admin-ui.mjs server/test-records.mjs server/email-auth.mjs server/mail-sender.mjs ./server/
COPY server/contracts/ ./server/contracts/
COPY server/vendor/ ./server/vendor/
COPY worker/prompt.mjs ./worker/prompt.mjs
USER node
ENV PORT=8787 BIND_HOST=0.0.0.0 CAMPUS_STATE_DIRECTORY=/var/lib/campus-inbox
EXPOSE 8787
CMD ["node", "server/index.mjs"]
