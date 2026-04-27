FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY services/prediction-service/package.json services/prediction-service/package.json
RUN npm install
COPY services/prediction-service services/prediction-service
RUN npm run build -w services/prediction-service
EXPOSE 3002
CMD ["npm", "run", "start", "-w", "services/prediction-service"]
