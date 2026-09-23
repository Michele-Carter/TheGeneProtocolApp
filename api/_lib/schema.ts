import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userStateScopeEnum = pgEnum("user_state_scope", [
  "protocol",
  "tracking",
  "reconstitution",
]);

export const userStateDocuments = pgTable("user_state_documents", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  scope: userStateScopeEnum("scope").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const protocols = pgTable("protocols", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserStateDocumentRow = typeof userStateDocuments.$inferSelect;
export type ProtocolRow = typeof protocols.$inferSelect;
