import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "@/mdx-components";

type DocsPageParams = {
  mdxPath?: string[];
};

type DocsPageProps = {
  params: Promise<DocsPageParams>;
};

export const generateStaticParams = generateStaticParamsFor("mdxPath");

export async function generateMetadata(props: DocsPageProps): Promise<Metadata> {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath ?? []);
  return metadata as Metadata;
}

export default async function DocsMdxPage(props: DocsPageProps) {
  const params = await props.params;
  const mdxPath = params.mdxPath ?? [];
  const {
    default: MdxContent,
    metadata,
    sourceCode,
    toc,
  } = await importPage(mdxPath);

  const Wrapper = getMDXComponents().wrapper;

  if (!Wrapper) {
    return <MdxContent {...props} params={params} />;
  }

  return (
    <Wrapper metadata={metadata} sourceCode={sourceCode} toc={toc}>
      <MdxContent {...props} params={params} />
    </Wrapper>
  );
}
