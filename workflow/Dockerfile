FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --no-save tsx
COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures
USER node
CMD ["npx", "tsx", "src/worker.ts"]
