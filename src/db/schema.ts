import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").default("owner"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  providerId: text("provider_id"),
  accountId: text("account_id"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const simulations = pgTable("simulations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  title: text("title"),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").default("pending"),
  params: jsonb("params").$type<Record<string, unknown>>(),
  weatherSnapshot: jsonb("weather_snapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const simulationResults = pgTable("simulation_results", {
  id: uuid("id").primaryKey(),
  simulationId: uuid("simulation_id").references(() => simulations.id),
  stepNumber: integer("step_number"),
  burnedCells: jsonb("burned_cells").$type<Record<string, unknown>>(),
  perimeterCells: jsonb("perimeter_cells").$type<Record<string, unknown>>(),
  burnedArea: real("burned_area"),
  perimeterLength: real("perimeter_length"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  simulationId: uuid("simulation_id").references(() => simulations.id),
  role: text("role"),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
});
