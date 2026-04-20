import { useMDXComponents as useNextraMDXComponents } from "nextra-theme-docs";
import type { MDXComponents } from "nextra/mdx-components";

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return useNextraMDXComponents(components ?? {});
}
