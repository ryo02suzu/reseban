import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AI の接続先。医療情報を扱うため、既定は国内リージョン。
 *
 *   AI_PROVIDER=bedrock   … Amazon Bedrock 東京（AWS_REGION、既定 ap-northeast-1）
 *   AI_PROVIDER=vertex    … Google Cloud Vertex AI 東京（VERTEX_REGION、既定 asia-northeast1 / GOOGLE_CLOUD_PROJECT 必須）
 *   AI_PROVIDER=anthropic … Anthropic API（国内リージョン指定不可。検証用）
 *
 * 未設定なら AI 機能は使えない（画面のボタンが押せない）。
 */
export type AiProvider = "bedrock" | "vertex" | "anthropic";

export interface AiConfig {
  provider: AiProvider | null;
  region: string;
  model: string;
  domestic: boolean;
}

export function getAiConfig(): AiConfig {
  const provider = (process.env.AI_PROVIDER ?? "") as AiProvider | "";
  switch (provider) {
    case "bedrock":
      return {
        provider,
        region: process.env.AWS_REGION ?? "ap-northeast-1",
        model: process.env.AI_MODEL ?? "anthropic.claude-opus-5",
        domestic: (process.env.AWS_REGION ?? "ap-northeast-1").startsWith("ap-northeast"),
      };
    case "vertex":
      return {
        provider,
        region: process.env.VERTEX_REGION ?? "asia-northeast1",
        model: process.env.AI_MODEL ?? "claude-opus-5",
        domestic: (process.env.VERTEX_REGION ?? "asia-northeast1").startsWith("asia-northeast"),
      };
    case "anthropic":
      return { provider, region: "Anthropic API", model: process.env.AI_MODEL ?? "claude-opus-5", domestic: false };
    default:
      return { provider: null, region: "", model: "", domestic: false };
  }
}

type BetaClient = Pick<Anthropic, "beta">;

let cached: { key: string; client: BetaClient } | null = null;

export async function getAiClient(): Promise<{ client: BetaClient; config: AiConfig }> {
  const config = getAiConfig();
  if (!config.provider) {
    throw new Error("AIの接続先が設定されていません（環境変数 AI_PROVIDER）。");
  }
  const key = `${config.provider}:${config.region}`;
  if (cached?.key === key) return { client: cached.client, config };

  let client: BetaClient;
  if (config.provider === "bedrock") {
    const { AnthropicBedrockMantle } = await import("@anthropic-ai/bedrock-sdk");
    client = new AnthropicBedrockMantle({ awsRegion: config.region }) as unknown as BetaClient;
  } else if (config.provider === "vertex") {
    const { AnthropicVertex } = await import("@anthropic-ai/vertex-sdk");
    client = new AnthropicVertex({
      region: config.region,
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    }) as unknown as BetaClient;
  } else {
    const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
    client = new AnthropicClient();
  }
  cached = { key, client };
  return { client, config };
}
