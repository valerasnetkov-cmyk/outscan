# Reuse the repository-reviewed immutable base; fixture identity is NOT yet built.
FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
WORKDIR /fixture
COPY --chown=0:0 probe.mjs resources.mjs ./
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node", "/fixture/probe.mjs"]
CMD ["hold"]
