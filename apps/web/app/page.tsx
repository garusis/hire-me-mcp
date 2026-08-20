import { CORE_PACKAGE_NAME } from "@hire-me-mcp/core";
import { CAREER_DATA_PACKAGE_NAME } from "../src/lib/content";
import { RevealOnScroll } from "./design-system/motion/reveal-on-scroll";
import { Badge } from "./design-system/primitives/badge";
import { Container } from "./design-system/primitives/container";
import { Heading } from "./design-system/primitives/heading";
import { Prose } from "./design-system/primitives/prose";
import { Section } from "./design-system/primitives/section";

export default function Home() {
  return (
    <Section>
      <Container>
        <RevealOnScroll>
          <Badge variant="accent">Under construction</Badge>
          <Heading level={1}>Hire-me MCP</Heading>
          <Prose>
            <p>Portfolio as an API — placeholder page, design work pending.</p>
            <p>Domain package: {CORE_PACKAGE_NAME}</p>
            <p>Career data package: {CAREER_DATA_PACKAGE_NAME}</p>
          </Prose>
        </RevealOnScroll>
      </Container>
    </Section>
  );
}
