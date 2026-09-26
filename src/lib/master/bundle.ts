import type { AgeEntry, CommentRequirement, ExclusiveEntry, LimitEntry, MasterData, ShinryoEntry } from "./types";

/** 点検で引くための索引。MasterData から作る（重いので使い回す） */
export interface MasterIndex {
  shinryo: Map<string, ShinryoEntry>;
  byKasan: Map<string, ShinryoEntry>;
  limits: Map<string, LimitEntry[]>;
  ages: Map<string, AgeEntry>;
  exclusives: Map<string, ExclusiveEntry[]>;
  /** code → group → 必要コメント */
  comments: Map<string, Map<string, CommentRequirement[]>>;
  byomei: Map<string, { name: string; abbr: string }>;
  shushokugo: Map<string, string>;
  shishiki: Map<string, string>;
  commentText: Map<string, string>;
  /** 歯科の診療行為で使われている施設基準コード */
  facilityCodes: Set<string>;
  loaded: Set<keyof MasterData>;
}

function group<T, K>(list: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of list) {
    const k = key(x);
    const cur = m.get(k);
    if (cur) cur.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function buildIndex(data: Partial<MasterData>): MasterIndex {
  const shinryo = new Map((data.shinryo ?? []).map((e) => [e.code, e]));
  const byKasan = new Map((data.shinryo ?? []).filter((e) => e.kasan).map((e) => [e.kasan, e]));
  const comments = new Map<string, Map<string, CommentRequirement[]>>();
  for (const c of data.commentRel ?? []) {
    const byGroup = comments.get(c.code) ?? new Map<string, CommentRequirement[]>();
    byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    comments.set(c.code, byGroup);
  }
  const facilityCodes = new Set<string>();
  for (const e of data.shinryo ?? []) for (const f of e.facility) facilityCodes.add(f);
  return {
    shinryo,
    byKasan,
    limits: group(data.limit ?? [], (e) => e.code),
    ages: new Map((data.age ?? []).map((e) => [e.code, e])),
    exclusives: group(data.exclusive ?? [], (e) => e.code),
    comments,
    byomei: new Map((data.byomei ?? []).map((e) => [e.code, { name: e.name, abbr: e.abbr }])),
    shushokugo: new Map((data.shushokugo ?? []).map((e) => [e.code, e.name])),
    shishiki: new Map((data.shishiki ?? []).map((e) => [e.code, e.name])),
    commentText: new Map((data.comment ?? []).map((e) => [e.code, e.text])),
    facilityCodes,
    loaded: new Set(Object.entries(data).filter(([, v]) => Array.isArray(v) && v.length).map(([k]) => k as keyof MasterData)),
  };
}

export const EMPTY_INDEX = buildIndex({});
