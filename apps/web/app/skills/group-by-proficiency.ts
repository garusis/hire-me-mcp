/**
 * Groups an already-`getSkillsListView`-ordered skill list into one section
 * per proficiency tier present (expert, then proficient, then familiar) —
 * the content layer's own order (#16) already sorts by tier, so this only
 * splits the flat list into sections; it never re-sorts or re-groups by any
 * criteria of its own. A tier with no skills produces no group, so `/skills`
 * never renders an empty section.
 */

import type { Skill } from "../../src/lib/content";

export interface ProficiencyGroup {
  proficiency: Skill["proficiency"];
  items: Skill[];
}

export function groupByProficiency(skills: readonly Skill[]): ProficiencyGroup[] {
  const groups: ProficiencyGroup[] = [];
  for (const skill of skills) {
    const currentGroup = groups.at(-1);
    if (currentGroup !== undefined && currentGroup.proficiency === skill.proficiency) {
      currentGroup.items.push(skill);
      continue;
    }
    groups.push({ proficiency: skill.proficiency, items: [skill] });
  }
  return groups;
}
