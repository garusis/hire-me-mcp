import { dataset, slugify } from "./dataset";

/** First project's detail route — real content always has at least one project (asserted below), matching `/projects/[slug]`. */
const [firstProject] = dataset.projects;
if (firstProject === undefined) {
  throw new Error(
    "preview e2e: packages/career-data has no projects — the /projects/[slug] route " +
      "check needs at least one to exercise a real detail page.",
  );
}

/** Every route the suite exercises for navigation/axe/responsive coverage — the routes listed in issue #58's Context. */
export const ROUTES: ReadonlyArray<{ path: string; name: string; heading: string }> = [
  { path: "/", name: "home", heading: "Marcos Javier Alvarez" },
  { path: "/experience", name: "experience", heading: "Experience" },
  { path: "/projects", name: "projects", heading: "Projects" },
  {
    path: `/projects/${slugify(firstProject.id)}`,
    name: "project-detail",
    heading: firstProject.name,
  },
  { path: "/skills", name: "skills", heading: "Skills" },
  { path: "/writing", name: "writing", heading: "Writing" },
  { path: "/mcp", name: "mcp", heading: "Add me to your AI" },
] as const;

export const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

export const THEMES = ["light", "dark"] as const;
