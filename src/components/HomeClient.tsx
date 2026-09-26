"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuditRunListItem } from "@/lib/types";
import { UploadPanel } from "./UploadPanel";
import { RunHistory } from "./RunHistory";

export function HomeClient({ initialRuns }: { initialRuns: AuditRunListItem[] }) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);

  return (
    <>
      <UploadPanel
        onRun={async () => {
          router.push(`/audits/${runs[0]?.id ?? "demo-202609"}`);
        }}
        onDemo={async () => {
          router.push("/audits/demo-202609");
        }}
      />
      <RunHistory runs={runs} onDelete={(id) => setRuns((r) => r.filter((x) => x.id !== id))} />
    </>
  );
}
