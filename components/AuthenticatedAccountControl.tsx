"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/client/firebaseClient";

export function AuthenticatedAccountControl() {
  const [status, setStatus] = useState<"idle" | "working" | "failed">("idle");

  const logout = async () => {
    setStatus("working");
    try {
      const response = await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("session-logout-failed");
      await signOut(firebaseClientAuth());
      window.location.assign("/auth");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-500">Signed in</span>
      <button
        type="button"
        onClick={logout}
        disabled={status === "working"}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
      >
        {status === "working" ? "ログアウト中…" : "ログアウト"}
      </button>
      {status === "failed" ? <span role="alert" className="text-xs text-red-300">再試行してください</span> : null}
    </div>
  );
}
