FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY services/dashboard-service/package.json services/dashboard-service/package.json
RUN npm install
COPY services/dashboard-service services/dashboard-service
RUN npm run build -w services/dashboard-service
EXPOSE 3003
CMD ["npm", "run", "start", "-w", "services/dashboard-service"]
