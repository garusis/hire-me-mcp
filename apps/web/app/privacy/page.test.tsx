import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileView } from "../../src/lib/content";

const { getProfileView } = vi.hoisted(() => ({ getProfileView: vi.fn() }));
vi.mock("../../src/lib/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/content")>();
  return { ...actual, getProfileView };
});

function profileView(): ProfileView {
  return {
    citations: [],
    profile: {
      id: "profile",
      name: "Ada Fixture",
      headline: "Fixture Engineer",
      location: "Remote",
      availability: "open",
      summary: "A fixture summary of Ada.",
      contacts: [
        { label: "Email", url: "mailto:ada@example.test" },
        { label: "GitHub", url: "https://github.com/ada-fixture" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/ada-fixture" },
      ],
    },
  };
}

describe("Privacy note page (#81)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("states the retention window in days", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: PrivacyPage } = await import("./page.js");

    render(await PrivacyPage());

    expect(screen.getByText(/90 days/i)).toBeInTheDocument();
  });

  it("lists what is collected and what is never collected", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: PrivacyPage } = await import("./page.js");

    render(await PrivacyPage());

    expect(screen.getByText(/raw question/i)).toBeInTheDocument();
    expect(screen.getByText(/ip address/i)).toBeInTheDocument();
  });

  it("names the third-party services used", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: PrivacyPage } = await import("./page.js");

    render(await PrivacyPage());

    expect(screen.getAllByText(/vercel/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/gemini/i)).toBeInTheDocument();
    expect(screen.getByText(/neon/i)).toBeInTheDocument();
    expect(screen.getByText(/upstash/i)).toBeInTheDocument();
  });

  it("links out to Marcos's public contact links from the profile, as the 'how to reach him' path — no separate contact tool", async () => {
    getProfileView.mockReturnValue(profileView());
    const { default: PrivacyPage } = await import("./page.js");

    render(await PrivacyPage());

    const linkedInLink = screen.getByRole("link", { name: /linkedin/i });
    expect(linkedInLink).toHaveAttribute("href", "https://www.linkedin.com/in/ada-fixture");
    const githubLink = screen.getByRole("link", { name: /github/i });
    expect(githubLink).toHaveAttribute("href", "https://github.com/ada-fixture");
  });
});
