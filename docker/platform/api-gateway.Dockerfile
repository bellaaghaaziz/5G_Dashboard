FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY services/api-gateway/package.json services/api-gateway/package.json
RUN npm install
COPY services/api-gateway services/api-gateway
RUN npm run build -w services/api-gateway
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "services/api-gateway"]
