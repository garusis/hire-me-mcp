/**
 * Typed, fail-fast environment configuration for the chat model provider.
 *
 * Owner decision (documented in the package README, inverting the original
 * issue text): the DEFAULT provider is Google Gemini free tier
 * (`gemini-3.5-flash-lite`, a pinned id — not the `-latest` alias), with
 * Anthropic Claude Haiku 4.5 wired as the swappable alternate. Neither this
 * module nor its errors ever include an API key's value — only the name of
 * the environment variable involved.
 *
 * Model swap (#72-adjacent, superseding the `gemini-3.6-flash` default set
 * while building #72): AI Studio dashboard quota data, corroborated by
 * #141's recorded `429 RESOURCE_EXHAUSTED` (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
 * quotaValue 20), showed the full flash models (`gemini-3.6-flash`,
 * `gemini-3.7-flash`) are capped at 5 RPM / 20 requests-per-DAY on the free
 * tier — a ceiling a single eval run can exhaust by itself, before counting
 * production chat traffic on the same key. The `-lite` flash models
 * (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`) get 15 RPM / 500 RPD —
 * enough headroom for both production chat and eval runs to share the free
 * tier. See `README.md`'s quota rationale table for the full comparison.
 */

/** The two AI SDK provider bindings this package knows how to construct. */
export type ChatProvider = "google" | "anthropic";

/** Resolved, ready-to-use configuration for building a chat language model. */
export interface ChatModelConfig {
  provider: ChatProvider;
  modelId: string;
  apiKey: string;
}

/** Minimal shape `resolveChatModelConfig` reads from — satisfied by `process.env`. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

const DEFAULT_PROVIDER: ChatProvider = "google";
const GOOGLE_DEFAULT_MODEL_ID = "gemini-3.5-flash-lite";
const ANTHROPIC_DEFAULT_MODEL_ID = "claude-haiku-4-5";

/** Thrown when a required environment variable is missing or blank. Never carries a value. */
export class MissingEnvVarError extends Error {
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.name = "MissingEnvVarError";
    this.variableName = variableName;
  }
}

/** Thrown when `CHAT_PROVIDER` is set to a value that isn't a known provider binding. */
export class InvalidChatProviderError extends Error {
  constructor(value: string) {
    super(`Invalid CHAT_PROVIDER value: "${value}". Expected "google" or "anthropic".`);
    this.name = "InvalidChatProviderError";
  }
}

function readRequired(env: EnvSource, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new MissingEnvVarError(name);
  }
  return value;
}

function resolveProvider(env: EnvSource): ChatProvider {
  const raw = env.CHAT_PROVIDER?.trim();
  if (!raw) {
    return DEFAULT_PROVIDER;
  }
  if (raw === "google" || raw === "anthropic") {
    return raw;
  }
  throw new InvalidChatProviderError(raw);
}

/**
 * Resolve the active chat model configuration from environment variables.
 *
 * Defaults to the `google` provider (Gemini free tier). Pass an explicit
 * `env` (e.g. an object literal in a test) instead of relying on the
 * `process.env` default so provider selection can be exercised without a
 * real API key or any network access.
 */
export function resolveChatModelConfig(env: EnvSource = process.env): ChatModelConfig {
  const provider = resolveProvider(env);
  const modelId = env.CHAT_MODEL_ID?.trim();

  if (provider === "google") {
    return {
      provider,
      modelId: modelId || GOOGLE_DEFAULT_MODEL_ID,
      apiKey: readRequired(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
    };
  }

  return {
    provider,
    modelId: modelId || ANTHROPIC_DEFAULT_MODEL_ID,
    apiKey: readRequired(env, "ANTHROPIC_API_KEY"),
  };
}
