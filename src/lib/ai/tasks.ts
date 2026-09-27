import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Finding } from "../types";
import { CATEGORY_LABELS } from "../types";
import type { ParsedReceipt } from "../uke/types";
import type { Rule } from "../rules/types";
import { validateRule } from "../rules/validate";
import { teethLabel } from "../teeth";
import { getAiClient } from "./client";
import { maskText } from "./mask";

/**
 * AI の仕事は3つだけ：根拠の説明／算定漏れ候補の提案／ルール案の作成。
 * どれも合否は決めない。渡すのは項目名・病名・部位・理由などで、
 * カルテ番号・レセプト番号・患者キーは渡さない（受け取った番号で院内側が引き当てる）。
 */

const SYSTEM = `あなたは日本の歯科保険診療（社会保険診療報酬）のレセプト点検を手伝うアシスタントです。
- 合否（算定できる／できない）の最終判断はしません。判定はルールエンジンが行っており、あなたは補足説明と提案だけを行います。
- 根拠を挙げるときは、告示・通知・疑義解釈など出典の種類を示し、条番号や点数など確信が持てない細部は「要確認」と明記してください。推測で数字を作らないでください。
- 歯科医院の受付・事務スタッフが読む前提で、専門用語はかみくだいて、短く書いてください。`;

async function call<T extends z.ZodType>(
  schema: T,
  user: string,
  effort: "low" | "medium" | "high",
): Promise<z.infer<T>> {
  const { client, config } = await getAiClient();
  const params = {
    model: config.model,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" as const },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user" as const, content: user }],
    // Anthropic API のみ：安全分類で断られたとき、推奨モデルで自動再実行
    ...(config.provider === "anthropic"
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  } satisfies MessageCreateParamsNonStreaming;
  const res = await client.beta.messages.parse(params);
  checkStop(res);
  if (!res.parsed_output) throw new Error("AIの応答を読み取れませんでした。もう一度お試しください。");
  return res.parsed_output as z.infer<T>;
}

function checkStop(res: BetaMessage) {
  if (res.stop_reason === "refusal") throw new Error("AIがこの依頼には回答できませんでした。");
  if (res.stop_reason === "max_tokens") throw new Error("AIの応答が長すぎて途中で切れました。対象を絞ってください。");
}

// ---------- 1. 根拠の説明 ----------
const ExplainSchema = z.object({ explanation: z.string() });

export async function explainFinding(f: Finding): Promise<string> {
  const facts = [
    `チェックの種類：${CATEGORY_LABELS[f.category]}`,
    `ルール：${f.ruleName}`,
    `対象項目：${f.itemName ?? "（不明）"}`,
    f.tooth ? `部位：${f.tooth}` : "",
    `ルールエンジンが出した理由：${f.reason}`,
    `ルールに登録された根拠：${f.basis}`,
    `ルールに登録された直し方：${f.fix}`,
    f.memo ? `院内メモ：${f.memo}` : "",
  ]
    .filter(Boolean)
    .map(maskText)
    .join("\n");
  const out = await call(
    ExplainSchema,
    `次のレセプト点検の指摘について、なぜ問題になるのか、どこを確認すればよいか、どう直すかを、事務スタッフ向けに200〜400字で説明してください。判定を覆したり、「問題ない」と断定したりはしないでください。\n\n${facts}`,
    "medium",
  );
  return out.explanation.trim();
}

// ---------- 2. 算定漏れ候補 ----------
const SuggestSchema = z.object({
  suggestions: z.array(
    z.object({
      receiptIndex: z.number().int(),
      itemName: z.string(),
      estimatedPoints: z.number(),
      rationale: z.string(),
    }),
  ),
});

export interface Suggestion {
  receipt: ParsedReceipt;
  itemName: string;
  estimatedPoints: number;
  rationale: string;
}

const MAX_RECEIPTS = 80;

export async function suggestMissed(receipts: ParsedReceipt[], filedStandards: string[]): Promise<Suggestion[]> {
  const target = receipts.slice(0, MAX_RECEIPTS);
  const lines = target.map((r, i) => {
    const diags = r.diagnoses.map((d) => `${d.name}${d.teeth.length ? `(${teethLabel(d.teeth)})` : ""}`).join("、");
    const age = r.ageEnd !== null ? `${r.ageEnd}歳` : "年齢不明";
    const acts = r.acts
      .filter((a) => a.name)
      .map((a) => `${a.name}×${a.count}${a.teeth.length ? `(${teethLabel(a.teeth)})` : ""}`)
      .join("、");
    return maskText(`#${i} ${age} 病名：${diags || "なし"} ／ 算定：${acts || "なし"}`);
  });
  const out = await call(
    SuggestSchema,
    `以下は歯科医院の当月レセプトの要約です（患者を特定する情報は除いてあります）。
届出済みの施設基準：${filedStandards.join("、") || "なし"}

算定できた可能性が高いのに算定されていない項目（管理料・指導料・加算など）を、根拠が比較的はっきりしているものに絞って最大15件挙げてください。
- receiptIndex は下の # の番号
- estimatedPoints は分かる範囲の見込み点数（不明なら0）
- rationale には、なぜ算定できそうか、算定要件のうち確認が必要な点を書く
- 算定要件を満たすか分からないものは挙げないでください

${lines.join("\n")}`,
    "high",
  );
  return out.suggestions
    .filter((s) => s.receiptIndex >= 0 && s.receiptIndex < target.length)
    .map((s) => ({
      receipt: target[s.receiptIndex],
      itemName: s.itemName,
      estimatedPoints: Math.max(0, Math.round(s.estimatedPoints)),
      rationale: s.rationale,
    }));
}

// ---------- 3. ルール案 ----------
const names = z.array(z.string());
const DraftSchema = z.object({
  rules: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["frequency", "exclusive", "prerequisite", "diagnosis", "comment", "facility"]),
      impact: z.enum(["henrei", "satei", "more"]),
      basis: z.string(),
      fix: z.string(),
      rationale: z.string(),
      targetNames: names,
      max: z.number().int().nullable(),
      per: z.enum(["day", "month", "months"]).nullable(),
      months: z.number().int().nullable(),
      otherNames: names,
      scope: z.enum(["day", "month"]).nullable(),
      lookbackMonths: z.number().int().nullable(),
      diagnosisNames: names,
      commentKeywords: names,
      standard: z.string().nullable(),
      facilityMode: z.enum(["required", "missed"]).nullable(),
    }),
  ),
});

export interface DraftResult {
  rule: Rule;
  rationale: string;
}

export async function draftRules(sourceText: string): Promise<{ drafts: DraftResult[]; errors: string[] }> {
  const out = await call(
    DraftSchema,
    `次の文書（診療報酬改定の通知・疑義解釈など）から、歯科レセプトの機械チェックに使えるルールを抜き出してください。
ルールの種類（kind）と各項目の使い方：
- frequency（回数・間隔）：targetNames を per（day=同日／month=同月／months=直近months ヶ月）あたり max 回まで
- exclusive（併算定不可）：targetNames と otherNames を scope（day／month）で同時に算定したら指摘
- prerequisite（前提）：targetNames の算定には otherNames が lookbackMonths ヶ月以内（0=同月）に必要
- diagnosis（病名）：targetNames の部位に diagnosisNames のいずれかの病名が必要
- comment（コメント）：targetNames に commentKeywords のいずれかを含むコメントが必要
- facility（施設基準）：facilityMode=required なら standard の届出なしで targetNames を算定したら指摘。missed なら届出ありで targetNames を算定したのに otherNames（加算など）がなければ算定漏れ
impact：返戻になりそう=henrei、減点（査定）になりそう=satei、算定漏れ=more
名称はマスターの名称に部分一致させるので、短く特徴的な語にしてください（例：「歯科疾患管理料」）。
使わない項目は null または空配列。文書から読み取れないルールは作らないでください。rationale には文書のどの記述から作ったかを書いてください。

--- 文書 ---
${maskText(sourceText)}`,
    "high",
  );

  const drafts: DraftResult[] = [];
  const errors: string[] = [];
  for (const d of out.rules) {
    const target = { names: d.targetNames };
    const other = { names: d.otherNames };
    const raw: Record<string, unknown> = {
      name: d.name,
      kind: d.kind,
      impact: d.impact,
      basis: d.basis,
      fix: d.fix,
      source: "ai",
      enabled: true,
      note: "AIが作成した案です。採用前に原文で確認してください。",
    };
    switch (d.kind) {
      case "frequency":
        Object.assign(raw, { target, max: d.max, per: d.per, months: d.months });
        break;
      case "exclusive":
        Object.assign(raw, { a: target, b: other, scope: d.scope });
        break;
      case "prerequisite":
        Object.assign(raw, { target, required: other, lookbackMonths: d.lookbackMonths ?? 0 });
        break;
      case "diagnosis":
        Object.assign(raw, { target, diagnosis: { names: d.diagnosisNames }, matchTooth: true });
        break;
      case "comment":
        Object.assign(raw, { target, comment: { keywords: d.commentKeywords } });
        break;
      case "facility":
        Object.assign(
          raw,
          d.facilityMode === "missed"
            ? { standard: d.standard, mode: "missed", when: target, expect: other }
            : { standard: d.standard, mode: "required", target },
        );
        break;
    }
    try {
      drafts.push({ rule: validateRule(raw), rationale: d.rationale });
    } catch (e) {
      errors.push(`「${d.name}」：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { drafts, errors };
}

// ---------- 接続テスト ----------
export async function pingAi(): Promise<string> {
  const out = await call(z.object({ ok: z.boolean() }), "接続テストです。ok に true を入れて返してください。", "low");
  if (!out.ok) throw new Error("想定外の応答でした");
  const { config } = await getAiClient();
  return `${config.model}（${config.region}）`;
}
