import { createLMStudioProvider } from "@/lib/ai/lmStudio";
import type { AIConfig, AIProvider } from "@/lib/ai/types";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEEPSEEK_PROXY_PATH = "/api/ai/deepseek";

/**
 * DeepSeek uses the same OpenAI-compatible chat-completions contract as the
 * existing LM Studio provider. Reusing that adapter keeps prompt construction,
 * JSON parsing, normalization, and the application-facing provider port in one
 * place. The API key is consumed only by the server-side proxy.
 */
export function createDeepSeekProvider(config: AIConfig): AIProvider {
  return createLMStudioProvider(
    {
      ...config,
      mode: "deepseek",
      baseUrl: config.baseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      model: config.model || DEFAULT_DEEPSEEK_MODEL,
      proxyPath: DEEPSEEK_PROXY_PATH,
      extraBody: {
        ...config.extraBody,
        response_format: { type: "json_object" }
      }
    },
    "DeepSeek API"
  );
}

