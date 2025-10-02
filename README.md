# Socket Backend Server

A pure backend server for WebSocket-based chat functionality with database integration.

## Features

- Real-time messaging with Socket.IO
- Private and group chat support
- MySQL database with Drizzle ORM
- User registration and conversation management
- Typing indicators

## Project Structure

```
├── server.js              # Main Express server with Socket.IO
├── src/utils/
│   ├── db.js             # Database connection
│   ├── schema.js         # Drizzle ORM schemas
│   └── db-operations.js  # Database operation functions
├── .env                  # Environment configuration
├── package.json          # Dependencies
└── README.md            # Documentation
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=office_management
   PORT=3001
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

## API

### Socket Events

- `register`: Register a user with their ID
- `join`: Join a conversation
- `leave`: Leave a conversation
- `send`: Send a message
- `startPrivateChat`: Start a private conversation
- `createGroupChat`: Create a group conversation
- `startTyping` / `stopTyping`: Typing indicators

### HTTP Endpoints

- `GET /health`: Health check endpoint

## Database Schema

- `users`: User information
- `conversations`: Chat conversations (private/group)
- `messages`: Chat messages
- `conversation_participants`: Conversation membership
