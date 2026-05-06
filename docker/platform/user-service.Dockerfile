FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY services/user-service/package.json services/user-service/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install
COPY services/user-service services/user-service
COPY packages/contracts packages/contracts
RUN npm run build -w services/user-service
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "services/user-service"]
