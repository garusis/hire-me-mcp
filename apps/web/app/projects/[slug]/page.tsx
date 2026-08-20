import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getProjectDetailView, listProjectSlugs } from "../../../src/lib/content";
import { Badge } from "../../design-system/primitives/badge";
import { Container } from "../../design-system/primitives/container";
import { Heading } from "../../design-system/primitives/heading";
import { Link } from "../../design-system/primitives/link";
import { Prose } from "../../design-system/primitives/prose";
import { Section } from "../../design-system/primitives/section";
import styles from "./page.module.css";

interface ProjectDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Exactly the slugs `packages/career-data`'s projects expose, via the
 * content layer — no separately maintained list, so this can't drift from
 * what `getProjectDetailView` accepts.
 */
export function generateStaticParams() {
  return listProjectSlugs().map((slug) => ({ slug }));
}

/**
 * `project.body` is plain MDX prose authored in `packages/career-data`'s
 * content files (frontmatter already stripped and validated by the content
 * loader before it reaches this view) — no embedded custom components today.
 * `next-mdx-remote/rsc`'s `compileMDX` compiles it straight from that string
 * inside this Server Component: no client bundle, no build-time codegen
 * step, and the source still flows through the content layer
 * (`getProjectDetailView`) rather than a direct `career-data` import.
 * `compileMDX` (rather than the sibling `<MDXRemote>` component) is used
 * deliberately — it resolves to a plain React node the page can `await`
 * once, so this stays a single ordinary async Server Component instead of
 * nesting a second async component inside it.
 */
export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { slug } = await params;
  const view = getProjectDetailView(slug);
  if (!view.found) {
    notFound();
  }
  const { project } = view.value;
  const { content: mdxContent } = await compileMDX({ source: project.body });

  return (
    <Section>
      <Container>
        <Heading level={1}>{project.name}</Heading>
        <p>{project.role}</p>
        <Prose>
          <p>{project.summary}</p>
        </Prose>
        <ul className={styles.techList}>
          {project.tech.map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
        <Prose>{mdxContent}</Prose>
        {project.links.length > 0 && (
          <ul className={styles.links}>
            {project.links.map((link) => (
              <li key={link.url}>
                <Link href={link.url}>{link.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
