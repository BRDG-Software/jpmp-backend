FROM node:23-alpine

# Build arguments
ARG VERSION=1.0.0

# Set environment variables
ENV API_VERSION=$VERSION

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "src/app.js"]
