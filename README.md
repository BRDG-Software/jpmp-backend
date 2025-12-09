# BRDG JPMP Backend API

Backend API for the BRDG JPMP kiosk application. The API has CORS enabled to allow cross-origin requests from the Flutter web application.

## API Documentation

The API is documented using the OpenAPI 3.0 specification. You can find the full schema in `openapi.yaml`.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file based on `.env.example`:

   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your database credentials.

4. Initialize the database schema (first time only):

   ```bash
   npm run init-db
   ```

5. Start the server:

   ```bash
   npm start
   ```

## Docker

The backend can be run using Docker:

### Local Docker Build

1. Build the Docker image:

   ```bash
   docker build -t brdg-jpmp-backend .
   ```

2. Run the container:

   ```bash
   docker run --rm -p 3000:3000 --env-file .env brdg-jpmp-backend
   ```

3. To initialize the database inside the container:

   ```bash
   docker run --rm --env-file .env brdg-jpmp-backend node src/app.js --init-database
   ```

## Debugging

A VSCode launch configuration is included in the project. To debug the backend:

1. Open the project in VSCode
2. Go to the Run and Debug view (Ctrl+Shift+D or Cmd+Shift+D)
3. Select "Run Backend API" from the dropdown
4. Press F5 or click the green play button

This will start the backend server with the Node.js debugger attached, allowing you to:

- Set breakpoints
- Inspect variables
- Step through code
- Use the debug console

## Features

- RESTful API with JSON responses
- PostgreSQL database integration
- CORS enabled for cross-origin requests
- Graceful shutdown on process exit (SIGINT, SIGTERM, uncaughtException)
- Proper database connection cleanup
- Versioning via Docker image tags

## API Endpoints

### Root

- `GET /` - Get API information
  - Returns API name, version, and environment
  - Version is automatically set from the Docker image tag when available

### Items

- `GET /items` - Get all items
- `GET /items/available` - Get available items
- `GET /items/kiosk/:type` - Get items by kiosk type (hat, drink, beauty)
- `GET /items/:id` - Get a specific item
- `POST /items` - Create a new item
- `PATCH /items/:id` - Update an item
- `DELETE /items/:id` - Delete an item

### Kiosks

- `GET /kiosks` - Get all kiosks
- `GET /kiosks/:id` - Get a specific kiosk
- `POST /kiosks` - Create a new kiosk
- `PATCH /kiosks/:id` - Update a kiosk
- `DELETE /kiosks/:id` - Delete a kiosk

### Orders

- `GET /orders` - Get all orders
- `GET /orders/status/:status` - Get orders by status (pending, processing, ready, completed)
- `GET /orders/:id` - Get a specific order
- `POST /orders` - Create a new order
- `PATCH /orders/:id` - Update an order's status
- `DELETE /orders/:id` - Delete an order
