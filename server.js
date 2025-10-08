import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getUserConversations,
  getConversationById,
  getConversationMessages,
  createMessage,
  isUserInConversation,
  findExistingPrivateChat,
  createPrivateConversation,
  createGroupConversation
} from './utils/db-operations.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://office.tritechnologies.net", // Adjust for production
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// --- In-memory Storage for real-time operations ---
const userToSocketMap = new Map();         // userId -> socket.id
const socketToUserMap = new Map();         // socket.id -> userId

// --- Socket.IO Logic ---

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // --- Event Handlers ---

  socket.on("register", async ({ userId }) => {
    console.log(`Registering user ${userId} to socket ${socket.id}`);
    userToSocketMap.set(userId, socket.id);
    socketToUserMap.set(socket.id, userId);

    try {
      const convsData = await getUserConversations(userId);
      console.log('Emitting conversations:', convsData);
      socket.emit("conversations", convsData);
      convsData.forEach(conv => socket.join(conv.id.toString()));
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  });

  socket.on("join", async (conversationId) => {
    try {
      const conv = await getConversationById(conversationId);
      if (conv) {
        socket.join(conversationId.toString());
        const recentMessages = await getConversationMessages(conversationId, 50);
        console.log('Emitting messageHistory:', recentMessages);
        socket.emit("messageHistory", recentMessages);
      }
    } catch (error) {
      console.error('Error joining conversation:', error);
    }
  });

  socket.on("leave", (conversationId) => {
    socket.leave(conversationId.toString());
  });

  socket.on("send", async ({ convId, content }, callback) => {
    const userId = socketToUserMap.get(socket.id);

    if (!userId) return callback({ success: false, error: "User not registered" });

    try {
      // Check if user is participant
      const isParticipant = await isUserInConversation(userId, convId);
      if (!isParticipant) {
        return callback({ success: false, error: "Not a member of this conversation" });
      }

      // Create message
      const messageData = {
        conversationId: convId,
        senderId: userId,
        content
      };

      const fullMessage = await createMessage(messageData);
      console.log('Emitting message:', fullMessage);
      io.to(convId.toString()).emit("message", fullMessage);
      callback({ success: true });
    } catch (error) {
      console.error('Error sending message:', error);
      callback({ success: false, error: "Failed to send message" });
    }
  });

  socket.on("startPrivateChat", async ({ otherUserId }, callback) => {
    const userId = socketToUserMap.get(socket.id);
    if (!userId) return callback({ success: false, error: "User not registered" });

    try {
      // Check if private conversation already exists
      let convId = await findExistingPrivateChat(userId, otherUserId);

      if (!convId) {
        // Create new conversation
        const newConv = await createPrivateConversation(userId, otherUserId);
        convId = newConv.id;

        // Notify participants
        newConv.participants.forEach(pId => {
          const participantSocketId = userToSocketMap.get(pId);
          if (participantSocketId) {
            console.log('Emitting conversationCreated to', pId, ':', newConv);
            io.to(participantSocketId).emit("conversationCreated", newConv);
          }
        });
      }

      console.log('Responding to startPrivateChat:', { success: true, conversationId: convId });
      callback({ success: true, conversationId: convId });
    } catch (error) {
      console.error('Error starting private chat:', error);
      callback({ success: false, error: "Failed to start chat" });
    }
  });

  socket.on("createGroupChat", async ({ name, participantIds }, callback) => {
    const creatorId = socketToUserMap.get(socket.id);
    if (!creatorId) {
      return callback({ success: false, error: "User not registered" });
    }

    try {
      const newConv = await createGroupConversation(name, creatorId, participantIds);

      // Notify participants
      newConv.participants.forEach(pId => {
        const participantSocketId = userToSocketMap.get(pId);
        if (participantSocketId) {
          console.log('Emitting conversationCreated to', pId, ':', newConv);
          io.to(participantSocketId).emit("conversationCreated", newConv);
        }
      });

      console.log('Responding to createGroupChat:', { success: true, conversation: newConv });
      callback({ success: true, conversation: newConv });
    } catch (error) {
      console.error('Error creating group chat:', error);
      callback({ success: false, error: "Failed to create group chat" });
    }
  });

  // --- Typing indicators ---
  socket.on("startTyping", ({ convId, userName }) => {
    const userId = socketToUserMap.get(socket.id);
    if (userId) {
      socket.to(convId.toString()).emit("userTyping", { userId, userName, convId });
    }
  });

  socket.on("stopTyping", ({ convId }) => {
    const userId = socketToUserMap.get(socket.id);
    if (userId) {
      socket.to(convId.toString()).emit("userStoppedTyping", { userId, convId });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    const userId = userToSocketMap.get(socket.id);
    if (userId) {
      // Notify rooms that this user has stopped typing
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          socket.to(room).emit("userStoppedTyping", { userId, convId: room });
        }
      });

      userToSocketMap.delete(userId);
      socketToUserMap.delete(socket.id);
      console.log(`User ${userId} unregistered.`);
    }
  });
});

// --- Basic API Routes ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
