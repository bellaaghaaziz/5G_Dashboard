FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web

ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_WS_URL=http://localhost:3003
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build -w apps/web
EXPOSE 5173
CMD ["npm", "run", "preview", "-w", "apps/web", "--", "--host", "0.0.0.0", "--port", "5173"]
