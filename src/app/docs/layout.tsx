import type { Metadata } from "next";
import Link from "next/link";
import { Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { House, LayoutDashboard } from "lucide-react";
import { DocsNavbarAuth } from "@/components/docs/DocsNavbarAuth";
import "nextra-theme-docs/style.css";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s | FireMapSim-v2 Docs",
  },
  description:
    "End-user documentation for FireMapSim-v2 workflows, features, troubleshooting, and FAQs.",
  icons: {
    icon: "/icons/favicon.svg",
  },
};

const navbar = (
  <Navbar
    logoLink={false}
    logo={
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "0.75rem",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
          }}
        >
          FireMapSim-v2
        </span>
        <Link
          aria-label="Home"
          href="/"
          style={{
            alignItems: "center",
            color: "inherit",
            display: "inline-flex",
            fontSize: "0.875rem",
            fontWeight: 500,
            gap: "0.375rem",
            textDecoration: "none",
          }}
        >
          <House size={16} />
          Home
        </Link>
        <Link
          aria-label="Dashboard"
          href="/dashboard"
          style={{
            alignItems: "center",
            color: "inherit",
            display: "inline-flex",
            fontSize: "0.875rem",
            fontWeight: 500,
            gap: "0.375rem",
            textDecoration: "none",
          }}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </Link>
      </div>
    }
    projectLink="https://github.com/1DeepakSrinivas/firemapsim-v2"
  >
    <DocsNavbarAuth />
  </Navbar>
);

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pageMap = await getPageMap("/docs");

  return (
    <>
      <Head />
      <style>{`
        html {
          scrollbar-gutter: stable;
        }

        .fms-docs-shell .nextra-navbar {
          position: fixed !important;
          top: 0 !important;
          left: 0;
          right: 0;
          z-index: 1200 !important;
        }

        .fms-docs-shell .nextra-sidebar + .nextra-toc + article {
          padding-top: calc(var(--nextra-navbar-height) + 1rem) !important;
        }

        @media (min-width: 1280px) {
          .fms-docs-shell {
            --fms-left-rail-width: 18rem;
            --fms-right-rail-width: 16rem;
            --fms-content-gutter: 1.5rem;
          }

          .fms-docs-shell [class*="max-w-(--nextra-content-width)"] {
            max-width: 100vw !important;
            width: 100% !important;
          }

          .fms-docs-shell .nextra-sidebar {
            position: fixed !important;
            left: 0;
            top: var(--nextra-navbar-height);
            bottom: 0;
            width: var(--fms-left-rail-width) !important;
          }

          .fms-docs-shell .nextra-toc {
            position: fixed !important;
            right: 0;
            top: var(--nextra-navbar-height);
            bottom: 0;
            width: var(--fms-right-rail-width) !important;
          }

          .fms-docs-shell .nextra-sidebar + .nextra-toc + article {
            margin-left: calc(var(--fms-left-rail-width) + var(--fms-content-gutter));
            margin-right: calc(var(--fms-right-rail-width) + var(--fms-content-gutter));
            width: auto !important;
          }
        }
      `}</style>
      <div className="fms-docs-shell">
        <Layout
          docsRepositoryBase="https://github.com/1DeepakSrinivas/firemapsim-v2/tree/main/content"
          editLink={null}
          feedback={{ content: null }}
          navigation={false}
          sidebar={{ defaultOpen: true, toggleButton: true }}
          toc={{ float: true, title: "On This Page" }}
          navbar={navbar}
          pageMap={pageMap}
        >
          {children}
        </Layout>
      </div>
    </>
  );
}
