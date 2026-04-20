"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import type { CSSProperties } from "react";

const linkStyle: CSSProperties = {
  alignItems: "center",
  border: "1px solid color-mix(in oklab, currentColor 18%, transparent)",
  borderRadius: "0.5rem",
  color: "inherit",
  display: "inline-flex",
  fontSize: "0.875rem",
  fontWeight: 500,
  height: "2rem",
  justifyContent: "center",
  lineHeight: 1,
  padding: "0 0.75rem",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

export function DocsNavbarAuth() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
      {isLoaded && isSignedIn ? (
        <UserButton />
      ) : (
        <>
          <SignInButton mode="modal">
            <button style={linkStyle} type="button">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button style={linkStyle} type="button">
              Sign up
            </button>
          </SignUpButton>
        </>
      )}
    </div>
  );
}
