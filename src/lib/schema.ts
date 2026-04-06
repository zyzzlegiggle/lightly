import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	username: text("username").unique(),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expiresAt").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt"),
});

export const project = pgTable("project", {
	id: text("id").primaryKey(),
	repoId: text("repoId").notNull(),
	githubUrl: text("githubUrl").notNull(),
	gradientKbId: text("gradientKbId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	doAppId: text("doAppId"),
	activeBranch: text("activeBranch").default("main"),
	lastPreviewUrl: text("lastPreviewUrl"),
	appSpecRaw: jsonb("appSpecRaw"),
	slackChannelId: text("slackChannelId"),
	pendingChanges: jsonb("pendingChanges"),
	linearProjectId: text("linearProjectId"),
	linearTeamId: text("linearTeamId"),
	notionPageId: text("notionPageId"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const workspaceNote = pgTable("workspaceNote", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	title: text("title").notNull().default("Untitled"),
	content: text("content").notNull().default(""),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const workspaceEvent = pgTable("workspaceEvent", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	title: text("title").notNull(),
	description: text("description"),
	startAt: timestamp("startAt").notNull(),
	endAt: timestamp("endAt"),
	allDay: boolean("allDay").notNull().default(false),
	color: text("color").default("zinc"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});
