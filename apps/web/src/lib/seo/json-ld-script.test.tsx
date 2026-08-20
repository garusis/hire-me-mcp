import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JsonLdScript } from "./json-ld-script";

describe("JsonLdScript", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an application/ld+json script tag containing the JSON-stringified data", () => {
    const { container } = render(
      <JsonLdScript data={{ "@type": "Person", name: "Ada Fixture" }} />,
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.textContent ?? "")).toEqual({
      "@type": "Person",
      name: "Ada Fixture",
    });
  });

  it("reflects a change in the data passed in", () => {
    const { container } = render(
      <JsonLdScript data={{ "@type": "Article", headline: "Changed" }} />,
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script?.textContent ?? "")).toEqual({
      "@type": "Article",
      headline: "Changed",
    });
  });
});
