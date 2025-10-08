import { getDb } from './db.js';
import { conversations, messages, conversationParticipants, users } from './schema.js';
import { sql, eq, and, ne, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core'; // Or /postgres-core, etc.

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
// export const getUserConversations = async (userId) => {
//   const db = await getDb();
//   const cp_all = alias(conversationParticipants, 'cp_all');
//   const userConvs = await db
//     .select({
//       id: conversations.id,
//       isGroupChat: conversations.isGroupChat,
//       name: conversations.name,
//       createdAt: conversations.createdAt,
//       participants: sql`array_agg(${cp_all.userId})`,
//       latestMessage: messages.content,
//       latestMessageTime: messages.createdAt
//     })
//     .from(conversations)
//     .innerJoin(conversationParticipants, and(eq(conversationParticipants.conversationId, conversations.id), eq(conversationParticipants.userId, userId)))
//     .leftJoin(cp_all, eq(cp_all.conversationId, conversations.id))
//     .leftJoin(messages, and(
//       eq(messages.conversationId, conversations.id),
//       eq(messages.id, db.select({ maxId: sql`MAX(${messages.id})` }).from(messages).where(eq(messages.conversationId, conversations.id)))
//     ))
//     .groupBy(conversations.id, conversations.isGroupChat, conversations.name, conversations.createdAt, messages.content, messages.createdAt)
//     .orderBy(desc(conversations.createdAt));

//   return userConvs.map(conv => ({
//     id: conv.id,
//     isGroupChat: conv.isGroupChat,
//     name: conv.name,
//     createdAt: conv.createdAt,
//     participants: [conv.participants], // This needs to be improved to get all participants
//     latestMessage: conv.latestMessage ? {
//       content: conv.latestMessage,
//       createdAt: conv.latestMessageTime
//     } : null
//   }));
// };

export const getUserConversations = async (userId) => {
  const db = await getDb();
  const cp_all = alias(conversationParticipants, 'cp_all');
  
  // REMOVED: The 'otherParticipantNameSubquery' constant is no longer here.
  // We will define it directly inside the .select() clause below.

  const userConvs = await db
    .select({
      id: conversations.id,
      isGroupChat: conversations.isGroupChat,
      name: sql`CASE WHEN ${conversations.isGroupChat} = 1 THEN ${conversations.name} ELSE (SELECT name FROM users LEFT JOIN conversation_participants cp ON cp.user_id = users.id WHERE cp.conversation_id = ${conversations.id} AND cp.user_id != ${userId} LIMIT 1) END`.as('name'),
      createdAt: conversations.createdAt,
      participants: sql`GROUP_CONCAT(DISTINCT ${cp_all.userId})`.as('participants'),
      latestMessage: sql`(SELECT content FROM messages WHERE conversation_id = ${conversations.id} ORDER BY id DESC LIMIT 1)`.as('latestMessage'),
      latestMessageTime: sql`(SELECT created_at FROM messages WHERE conversation_id = ${conversations.id} ORDER BY id DESC LIMIT 1)`.as('latestMessageTime'),
    })
    .from(conversations)
    .innerJoin(conversationParticipants, and(
      eq(conversationParticipants.conversationId, conversations.id),
      eq(conversationParticipants.userId, userId)
    ))
    .leftJoin(cp_all, eq(cp_all.conversationId, conversations.id))
    .groupBy(
      conversations.id,
      conversations.isGroupChat,
      conversations.name,
      conversations.createdAt
    )
    .orderBy(desc(conversations.createdAt));

  // Post-processing to format the data as needed
  return userConvs.map(conv => ({
    id: conv.id,
    isGroupChat: !!conv.isGroupChat,
    name: conv.name,
    createdAt: conv.createdAt,
    participants: conv.participants ? conv.participants.split(',').map(Number) : [],
    latestMessage: conv.latestMessage ? {
      content: conv.latestMessage,
      createdAt: conv.latestMessageTime
    } : null,
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

// export const createMessage = async (messageData) => {
//   const db = await getDb();
//   const result = await db.insert(messages).values({
//     ...messageData,
//     createdAt: new Date()
//   });

//   // Get the inserted ID
//   const insertedId = result[0].insertId;

//   // Return the full message object
//   return {
//     id: insertedId,
//     ...messageData,
//     createdAt: new Date().toISOString()
//   };
// };

export const createMessage = async (messageData) => {
  const db = await getDb();
  
  // 1. Insert the new message
  const result = await db.insert(messages).values({
    ...messageData,
    createdAt: new Date()
  });

  const insertedId = result[0].insertId;

  // 2. Fetch the full message with sender's details
  const fullMessage = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt,
      senderName: users.name, // <-- ADDED
      senderProfilePicture: users.profile_picture, // <-- ADDED
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id)) // <-- ADDED JOIN
    .where(eq(messages.id, insertedId))
    .limit(1);

  // Return the full message object
  return fullMessage[0] || null;
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