# Stage 1: Build the Vite React app
FROM node:20-alpine AS build

WORKDIR /app

# Copy only package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev deps needed for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
