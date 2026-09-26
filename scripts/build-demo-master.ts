/**
 * tests/fixtures/ssk（支払基金の公式マスターからの抜粋）を解析して、
 * 「サンプルデータで試す」用のマスター src/lib/demo/master.json を作る。
 *   npx tsx scripts/build-demo-master.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseMasterFile } from "../src/lib/master/parse";
import type { MasterData, MasterKind } from "../src/lib/master/types";

const dir = path.join(process.cwd(), "tests/fixtures/ssk");
const files: Record<MasterKind, string> = {
  shinryo: "h_ALL_excerpt.csv",
  limit: "h-6_excerpt.csv",
  age: "h-8_excerpt.csv",
  exclusive: "h-9_ALL.csv",
  commentRel: "ck_excerpt.csv",
  byomei: "b_excerpt.txt",
  shushokugo: "z_excerpt.txt",
  shishiki: "f_ALL.csv",
  comment: "c_excerpt.csv",
};
const data = {} as MasterData;
for (const [kind, file] of Object.entries(files) as [MasterKind, string][]) {
  (data as Record<MasterKind, unknown>)[kind] = parseMasterFile(kind, new Uint8Array(readFileSync(path.join(dir, file))));
}
writeFileSync(path.join(process.cwd(), "src/lib/demo/master.json"), JSON.stringify(data));
console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length])));
