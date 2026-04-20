import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Fustat, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/ThemeProvider";

const fustatSans = Fustat({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FireMapSim-v2",
    template: "%s | FireMapSim-v2",
  },
  description:
    "A map-first wildfire simulation research workspace with agent-assisted scenario setup and dashboard-based project management.",
  icons: {
    icon: "/icons/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${fustatSans.variable} ${geistMono.variable} min-h-full flex flex-col font-sans antialiased`}
      >
        {/* React 19: use next/script instead of raw <script> in the tree (beforeInteractive runs before hydration). */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <ClerkProvider>
          <ThemeProvider>
            {children}
            <Toaster
              theme="system"
              richColors
              toastOptions={{
                style: {
                  background: "var(--card)",
                  color: "var(--card-foreground)",
                  border: "1px solid var(--border)",
                },
              }}
            />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
