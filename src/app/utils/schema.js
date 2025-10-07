import { mysqlTable, int, varchar, boolean, text, timestamp, primaryKey } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// ------------------ Users ------------------
export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  usertype: varchar('usertype', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  profile_picture: varchar('profile_picture', { length: 255 }),
  phone_number: varchar('phone_number', { length: 20 }),
  cnic: varchar('cnic', { length: 15 }),
  father_name: varchar('father_name', { length: 255 }),
  father_cnic: varchar('father_cnic', { length: 15 }),
  project_id: int('project_id'),
  team_id: int('team_id'),
  depart_id: varchar('depart_id', { length: 255 }),
  created_at: int('created_at').notNull().default(() => 'UNIX_TIMESTAMP()'),
  otp: varchar('otp', { length: 6 }),
  otp_expires_at: timestamp('otp_expires_at'),
});

// ------------------ Conversations ------------------
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  isGroupChat: boolean("is_group_chat").notNull().default(false),
  name: varchar("name", { length: 255 }), // Used for group chats
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ------------------ Messages ------------------
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: int("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ------------------ Conversation Participants ------------------
export const conversationParticipants = mysqlTable(
  "conversation_participants",
  {
    conversationId: int("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => ({
    cpPk: primaryKey({ columns: [table.conversationId, table.userId] }),
  })
);