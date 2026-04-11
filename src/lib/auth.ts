import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { adminAc, defaultAc } from "better-auth/plugins/admin/access";
import { Pool } from "pg";

import { db, schema } from "@/db/index";

if (!(db.$client instanceof Pool)) {
  throw new Error("Expected Drizzle to be configured with a pg Pool client");
}

const plannerRole = defaultAc.newRole({
  user: ["list", "get", "update"],
  session: ["list"],
});

const viewerRole = defaultAc.newRole({
  user: ["get"],
  session: [],
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [
    admin({
      defaultRole: "owner",
      adminRoles: ["owner", "planner", "viewer"],
      roles: {
        owner: adminAc,
        planner: plannerRole,
        viewer: viewerRole,
      },
    }),
  ],
  user: {
    modelName: "users",
  },
  session: {
    modelName: "sessions",
  },
  account: {
    modelName: "accounts",
  },
  verification: {
    modelName: "verifications",
  },
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
});

export async function getSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
