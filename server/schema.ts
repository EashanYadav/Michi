import { decimal, integer, jsonb, pgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const michi = pgSchema("michi");

export const users = michi.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: varchar("full_name", { length: 100 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  profileImage: text("profile_image"),
  authProvider: varchar("auth_provider", { length: 50 }).default("email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const routes = michi.table("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  routeName: varchar("route_name", { length: 255 }),
  distanceKm: decimal("distance_km", { precision: 5, scale: 2 }).notNull(),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  elevationGainMeters: integer("elevation_gain_meters").default(0),
  startLatitude: decimal("start_latitude", { precision: 10, scale: 8 }),
  startLongitude: decimal("start_longitude", { precision: 11, scale: 8 }),
  routeCoordinates: jsonb("route_coordinates").notNull(),
  geojson: jsonb("geojson"),
  noveltyScore: integer("novelty_score"),
  createdAt: timestamp("created_at").defaultNow()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SavedRoute = typeof routes.$inferSelect;
export type NewSavedRoute = typeof routes.$inferInsert;
