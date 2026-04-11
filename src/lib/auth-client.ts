"use client";

import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
export const useSession = authClient.useSession;
