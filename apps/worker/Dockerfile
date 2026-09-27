FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /repo

# Workspace install needs the whole monorepo's package.json files present
# before `npm ci` can resolve @qapipex/* internal deps.
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci

COPY packages/db packages/db
COPY packages/shared-types packages/shared-types
COPY apps/worker apps/worker

WORKDIR /repo/apps/worker
EXPOSE 4088
CMD ["npx", "tsx", "src/server.ts"]
