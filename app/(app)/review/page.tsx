"use client";

import { ReviewWorkspace } from "@/components/files/ReviewWorkspace";
import { selectIsAdmin, useAuthStore } from "@/store/auth-store";

export default function ReviewPage() {
  const ready = useAuthStore((s) => s.ready);
  const isAdmin = useAuthStore(selectIsAdmin);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return <ReviewWorkspace isAdmin={isAdmin} />;
}
