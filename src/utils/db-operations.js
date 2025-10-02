import { getDb } from './db.js';
import { conversations, messages, conversationParticipants, users } from './schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

// User operations
export const getUserById = async (userId) => {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0] || null;
};

// Conversation operations
export const getUserConversations = async (userId) => {
  const db = await getDb();
  const userConvs = await db
    .select({
      id: conversations.id,
      isGroupChat: conversations.isGroupChat,
      name: conversations.name,
      createdAt: conversations.createdAt,
      participants: conversationParticipants.userId,
      latestMessage: messages.content,
      latestMessageTime: messages.createdAt
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .leftJoin(messages, and(
      eq(messages.conversationId, conversations.id),
      eq(messages.id, db.select({ maxId: sql`MAX(${messages.id})` }).from(messages).where(eq(messages.conversationId, conversations.id)))
    ))
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.createdAt));

  return userConvs.map(conv => ({
    id: conv.id,
    isGroupChat: conv.isGroupChat,
    name: conv.name,
    createdAt: conv.createdAt,
    participants: [conv.participants], // This needs to be improved to get all participants
    latestMessage: conv.latestMessage ? {
      content: conv.latestMessage,
      createdAt: conv.latestMessageTime
    } : null
  }));
};

export const getConversationById = async (conversationId) => {
  const db = await getDb();
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return result[0] || null;
};

export const createConversation = async (conversationData) => {
  const db = await getDb();
  const result = await db.insert(conversations).values(conversationData);
  // Get the inserted ID - Drizzle returns the insertId
  const insertedId = result[0].insertId;
  return insertedId;
};

export const createGroupConversation = async (name, creatorId, participantIds) => {
  const db = await getDb();
  const allParticipantIds = [...new Set([creatorId, ...participantIds])];

  const conversationData = {
    isGroupChat: true,
    name,
    createdAt: new Date()
  };

  const conversationId = await createConversation(conversationData);

  // Add participants
  const participantValues = allParticipantIds.map(userId => ({
    conversationId,
    userId,
    joinedAt: new Date()
  }));

  await db.insert(conversationParticipants).values(participantValues);

  return {
    id: conversationId,
    name,
    participants: allParticipantIds,
    isGroupChat: true,
    messages: [],
    createdAt: conversationData.createdAt.toISOString(),
  };
};

export const findExistingPrivateChat = async (userId1, userId2) => {
  const db = await getDb();
  const participants = [userId1, userId2].sort();

  // Check if private conversation already exists between these two users
  const existingConvs = await db
    .select({
      conversationId: conversationParticipants.conversationId,
      userId: conversationParticipants.userId
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .where(and(
      eq(conversations.isGroupChat, false),
      eq(conversationParticipants.userId, participants[0])
    ));

  for (const conv of existingConvs) {
    // Check if the other participant is also in this conversation
    const otherParticipant = await db
      .select()
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conv.conversationId),
        eq(conversationParticipants.userId, participants[1])
      ))
      .limit(1);

    if (otherParticipant.length > 0) {
      return conv.conversationId;
    }
  }

  return null;
};

export const createPrivateConversation = async (userId1, userId2) => {
  const db = await getDb();
  const participants = [userId1, userId2].sort();

  const conversationData = {
    isGroupChat: false,
    createdAt: new Date()
  };

  const conversationId = await createConversation(conversationData);

  // Add participants
  await db.insert(conversationParticipants).values([
    { conversationId, userId: participants[0], joinedAt: new Date() },
    { conversationId, userId: participants[1], joinedAt: new Date() }
  ]);

  return {
    id: conversationId,
    participants,
    messages: [],
    isGroupChat: false,
    createdAt: conversationData.createdAt.toISOString()
  };
};

// Message operations
export const getConversationMessages = async (conversationId, limit = 50) => {
  const db = await getDb();
  const result = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return result.reverse(); // Return in chronological order
};

export const createMessage = async (messageData) => {
  const db = await getDb();
  const result = await db.insert(messages).values({
    ...messageData,
    createdAt: new Date()
  });

  // Get the inserted ID
  const insertedId = result[0].insertId;

  // Return the full message object
  return {
    id: insertedId,
    ...messageData,
    createdAt: new Date().toISOString()
  };
};

export const isUserInConversation = async (userId, conversationId) => {
  const db = await getDb();
  const result = await db
    .select()
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ))
    .limit(1);

  return result.length > 0;
};