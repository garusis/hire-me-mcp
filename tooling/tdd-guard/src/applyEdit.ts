/**
 * Reconstructs the post-edit content of a file from a Claude Code
 * PreToolUse `tool_input` payload, so the PreToolUse hook can evaluate a
 * proposed edit's *result* before it is written to disk.
 *
 * Supports the three edit-shaped tools: Write (full content replacement),
 * Edit (single old_string/new_string replacement), and MultiEdit (a
 * sequence of old_string/new_string replacements applied in order).
 */

interface SingleReplace {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

function applyReplace(content: string, edit: SingleReplace): string {
  if (edit.replace_all) {
    return content.split(edit.old_string).join(edit.new_string);
  }
  const index = content.indexOf(edit.old_string);
  if (index === -1) return content;
  return content.slice(0, index) + edit.new_string + content.slice(index + edit.old_string.length);
}

function isSingleReplace(value: unknown): value is SingleReplace {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).old_string === "string" &&
    typeof (value as Record<string, unknown>).new_string === "string"
  );
}

/**
 * Computes the content a file would have after applying `toolInput` (the
 * `tool_input` field of a Claude Code Edit/Write/MultiEdit PreToolUse
 * payload) on top of `oldContent`. Falls back to `oldContent` unchanged for
 * unrecognized shapes rather than throwing, since the hook must never crash
 * mid-edit.
 */
export function applyEditToolInput(
  oldContent: string,
  toolName: string,
  toolInput: unknown,
): string {
  const input = (toolInput ?? {}) as Record<string, unknown>;

  if (toolName === "Write") {
    return typeof input.content === "string" ? input.content : oldContent;
  }

  if (toolName === "Edit" && isSingleReplace(input)) {
    return applyReplace(oldContent, input);
  }

  if (toolName === "MultiEdit" && Array.isArray(input.edits)) {
    return input.edits.reduce<string>((content, edit) => {
      return isSingleReplace(edit) ? applyReplace(content, edit) : content;
    }, oldContent);
  }

  return oldContent;
}
