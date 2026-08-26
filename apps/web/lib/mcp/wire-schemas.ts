/**
 * Shared Zod building blocks for MCP `outputSchema`s (#242). Every tool
 * returns the same success envelope — `{ data, citations }`, built by
 * `envelope.ts` — so every tool's `outputSchema` is `toolSuccessSchema(<its
 * data schema>)`. Declaring these means `tools/list` documents the exact
 * `structuredContent` shape, strict clients can validate it, and the MCP
 * SDK itself re-validates every success result against it at runtime.
 */

import { z } from "zod";
import { citationSchema } from "../../src/lib/content/entity-schemas";

/**
 * A citation as it appears INSIDE a tool's `data` payload (e.g.
 * `get-skill-evidence`'s `evidence` arrays): the authored citation shape,
 * with `url` optional — only the envelope's top-level `citations` array is
 * guaranteed enrichment (#247).
 */
export const dataCitationSchema = citationSchema.extend({
  url: z.url().optional().describe("Canonical external URL for the cited record, when it has one."),
});

/**
 * A citation as it appears in the envelope's top-level `citations` array:
 * always resolvable — `url` is guaranteed by `citation-site-urls.ts` (#247),
 * pointing at the cited record's external canonical source or its page on
 * this site.
 */
export const envelopeCitationSchema = citationSchema.extend({
  url: z
    .url()
    .describe(
      "URL back to the cited source: its external canonical link when it has one, " +
        "otherwise the record's page on this site.",
    ),
});

/** Builds the `{ data, citations }` success-envelope schema around a tool's own data schema. */
export function toolSuccessSchema<DataSchema extends z.ZodTypeAny>(dataSchema: DataSchema) {
  return z.object({
    data: dataSchema,
    citations: z
      .array(envelopeCitationSchema)
      .describe("Citations backing this result — every entry carries a resolvable url."),
  });
}
