FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build -w apps/web
EXPOSE 5173
CMD ["npm", "run", "preview", "-w", "apps/web", "--", "--host", "0.0.0.0", "--port", "5173"]
