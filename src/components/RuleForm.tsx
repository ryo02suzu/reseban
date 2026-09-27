"use client";

import { useEffect, useRef, useState } from "react";
import type { Rule } from "@/lib/rules/types";

type EditableRule = Exclude<Rule, { kind: "official" }>;
type EditableKind = EditableRule["kind"];
import type { Impact } from "@/lib/types";
import { CATEGORY_LABELS, IMPACT_LABELS } from "@/lib/types";

/** 画面用の平らな入力値（名称はカンマ区切り） */
interface FormState {
  name: string;
  kind: EditableKind;
  impact: Impact;
  basis: string;
  fix: string;
  target: string;
  exclude: string;
  other: string;
  max: string;
  per: "day" | "month" | "months";
  months: string;
  perTooth: boolean;
  scope: "day" | "month";
  sameTooth: boolean;
  lookbackMonths: string;
  mustPrecede: boolean;
  diagnosis: string;
  abbrs: string;
  matchTooth: boolean;
  keywords: string;
  standard: string;
  mode: "required" | "missed";
}

const EMPTY: FormState = {
  name: "",
  kind: "frequency",
  impact: "satei",
  basis: "",
  fix: "",
  target: "",
  exclude: "",
  other: "",
  max: "1",
  per: "month",
  months: "2",
  perTooth: false,
  scope: "day",
  sameTooth: false,
  lookbackMonths: "0",
  mustPrecede: false,
  diagnosis: "",
  abbrs: "",
  matchTooth: true,
  keywords: "",
  standard: "",
  mode: "required",
};

const join = (a?: string[]) => (a ?? []).join("、");
const refText = (r?: { names?: string[]; codes?: string[] }) => join([...(r?.codes ?? []), ...(r?.names ?? [])]);
/** 9桁の数字はマスターのコード、それ以外は名称の一部として扱う */
const toRef = (s: string, exclude?: string) => {
  const parts = split(s);
  const codes = parts.filter((p) => /^\d{9}$/.test(p));
  const names = parts.filter((p) => !/^\d{9}$/.test(p));
  return { ...(codes.length ? { codes } : {}), ...(names.length ? { names } : {}), ...(exclude ? { excludeNames: split(exclude) } : {}) };
};
const split = (s: string) =>
  s
    .split(/[、,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function fromRule(r: EditableRule): FormState {
  const f: FormState = { ...EMPTY, name: r.name, kind: r.kind, impact: r.impact, basis: r.basis, fix: r.fix };
  switch (r.kind) {
    case "frequency":
      return {
        ...f,
        target: refText(r.target),
        exclude: join(r.target.excludeNames),
        max: String(r.max),
        per: r.per,
        months: String(r.months ?? 2),
        perTooth: !!r.perTooth,
      };
    case "exclusive":
      return {
        ...f,
        target: refText(r.a),
        exclude: join(r.a.excludeNames),
        other: refText(r.b),
        scope: r.scope,
        sameTooth: !!r.sameTooth,
      };
    case "prerequisite":
      return {
        ...f,
        target: refText(r.target),
        exclude: join(r.target.excludeNames),
        other: refText(r.required),
        lookbackMonths: String(r.lookbackMonths),
        mustPrecede: !!r.mustPrecede,
      };
    case "diagnosis":
      return {
        ...f,
        target: refText(r.target),
        exclude: join(r.target.excludeNames),
        diagnosis: join(r.diagnosis.names),
        matchTooth: r.matchTooth,
      };
    case "comment":
      return { ...f, target: refText(r.target), exclude: join(r.target.excludeNames), keywords: join(r.comment.keywords) };
    case "facility":
      return r.mode === "required"
        ? { ...f, standard: r.standard, mode: "required", target: refText(r.target), exclude: join(r.target?.excludeNames) }
        : {
            ...f,
            standard: r.standard,
            mode: "missed",
            target: refText(r.when),
            exclude: join(r.when?.excludeNames),
            other: refText(r.expect),
          };
  }
}

function toRaw(f: FormState): Record<string, unknown> {
  const target = toRef(f.target, f.exclude);
  const other = toRef(f.other);
  const base = { name: f.name, kind: f.kind, impact: f.impact, basis: f.basis, fix: f.fix };
  switch (f.kind) {
    case "frequency":
      return { ...base, target, max: Number(f.max), per: f.per, months: Number(f.months), perTooth: f.perTooth };
    case "exclusive":
      return { ...base, a: target, b: other, scope: f.scope, sameTooth: f.sameTooth };
    case "prerequisite":
      return { ...base, target, required: other, lookbackMonths: Number(f.lookbackMonths), mustPrecede: f.mustPrecede };
    case "diagnosis":
      return { ...base, target, diagnosis: { names: split(f.diagnosis), abbrs: split(f.abbrs) }, matchTooth: f.matchTooth, perTooth: f.perTooth };
    case "comment":
      return { ...base, target, comment: { keywords: split(f.keywords) } };
    case "facility":
      return f.mode === "required"
        ? { ...base, standard: f.standard, mode: "required", target }
        : { ...base, standard: f.standard, mode: "missed", when: target, expect: other };
  }
}

const TARGET_LABEL: Record<EditableKind, string> = {
  frequency: "対象の診療行為",
  exclusive: "項目A",
  prerequisite: "対象の診療行為",
  diagnosis: "対象の診療行為",
  comment: "対象の診療行為",
  facility: "対象の診療行為",
};

export function RuleFormDialog({
  open,
  title,
  initial,
  submitLabel,
  facilities,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: EditableRule;
  submitLabel: string;
  facilities: { code: string; name: string }[];
  onClose: () => void;
  onSubmit: (raw: Record<string, unknown>) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose}>
      {open && (
        <RuleFormBody
          key={initial?.id ?? "new"}
          title={title}
          initial={initial}
          submitLabel={submitLabel}
          facilities={facilities}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </dialog>
  );
}

function RuleFormBody({
  title,
  initial,
  submitLabel,
  facilities,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: EditableRule;
  submitLabel: string;
  facilities: { code: string; name: string }[];
  onClose: () => void;
  onSubmit: (raw: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState<FormState>(() => (initial ? fromRule(initial) : EMPTY));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof FormState, label: string, placeholder = "", full = false) => (
    <label className={`field${full ? " full" : ""}`}>
      <span>{label}</span>
      <input type="text" value={f[k] as string} placeholder={placeholder} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );
  const check = (k: keyof FormState, label: string) => (
    <label className="check">
      <input type="checkbox" checked={f[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} />
      {label}
    </label>
  );
  const facilityMissed = f.kind === "facility" && f.mode === "missed";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
          await onSubmit(toRaw(f));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 style={{ marginBottom: 16 }}>{title}</h2>
      <div className="form-grid">
        {text("name", "ルール名", "例：歯科疾患管理料は月1回", true)}
        <label className="field">
          <span>チェックの種類</span>
          <select value={f.kind} onChange={(e) => set("kind", e.target.value as EditableKind)}>
            {(Object.keys(TARGET_LABEL) as EditableKind[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>見つかったときの扱い</span>
          <select value={f.impact} onChange={(e) => set("impact", e.target.value as Impact)}>
            {(["henrei", "satei", "more"] as const).map((k) => (
              <option key={k} value={k}>
                {IMPACT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {f.kind === "facility" && (
          <>
            <label className="field">
              <span>施設基準コード（例：1352、複数はカンマ区切り）</span>
              <input type="text" list="standards" value={f.standard} onChange={(e) => set("standard", e.target.value)} />
              <datalist id="standards">
                {facilities.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>パターン</span>
              <select value={f.mode} onChange={(e) => set("mode", e.target.value as FormState["mode"])}>
                <option value="required">届出なしで算定している</option>
                <option value="missed">届出があるのに加算を取っていない</option>
              </select>
            </label>
          </>
        )}

        {text("target", facilityMissed ? "きっかけの診療行為（例：初診料）" : TARGET_LABEL[f.kind], "名称の一部か9桁のコード。複数は「、」区切り")}
        {text("exclude", "除外する名称（任意）", "例：加算")}

        {f.kind === "frequency" && (
          <>
            <label className="field">
              <span>期間</span>
              <select value={f.per} onChange={(e) => set("per", e.target.value as FormState["per"])}>
                <option value="day">同じ日</option>
                <option value="month">同じ月</option>
                <option value="months">直近◯ヶ月</option>
              </select>
            </label>
            <div className="row" style={{ alignItems: "flex-end" }}>
              {f.per === "months" && text("months", "月数（当月含む）")}
              {text("max", "上限回数")}
            </div>
            {check("perTooth", "歯ごとに数える")}
          </>
        )}
        {f.kind === "exclusive" && (
          <>
            {text("other", "項目B（指摘する側）", "複数は「、」区切り")}
            <label className="field">
              <span>範囲</span>
              <select value={f.scope} onChange={(e) => set("scope", e.target.value as FormState["scope"])}>
                <option value="day">同じ日</option>
                <option value="month">同じ月</option>
              </select>
            </label>
            {check("sameTooth", "同じ歯のときだけ")}
          </>
        )}
        {f.kind === "prerequisite" && (
          <>
            {text("other", "前提になる検査・管理", "例：歯周基本検査、歯周精密検査")}
            {text("lookbackMonths", "さかのぼる月数（0＝同じ月）")}
            {check("mustPrecede", "対象より前の日付に必要")}
          </>
        )}
        {f.kind === "diagnosis" && (
          <>
            {text("diagnosis", "必要な病名", "例：歯周炎")}
            {check("matchTooth", "同じ部位（歯）の病名に限る")}
          </>
        )}
        {f.kind === "comment" && text("keywords", "コメントに含まれるべき語（空欄なら何かコメントがあればOK）", "例：時")}
        {facilityMissed && text("other", "取れるはずの加算", "例：医療安全対策加算")}

        <label className="field full">
          <span>根拠</span>
          <textarea
            value={f.basis}
            style={{ minHeight: 60 }}
            onChange={(e) => set("basis", e.target.value)}
            placeholder="告示・通知・疑義解釈など"
          />
        </label>
        <label className="field full">
          <span>直し方</span>
          <textarea value={f.fix} style={{ minHeight: 60 }} onChange={(e) => set("fix", e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="notice error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose}>
          キャンセル
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
