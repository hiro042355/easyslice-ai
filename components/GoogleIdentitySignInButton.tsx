"use client";

import { useRef, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { firebaseClientAuth, googleIdentityProvider } from "@/lib/client/firebaseClient";
import {
  createSingleFlight,
  establishGoogleIdentitySession,
  type GoogleIdentitySignInFailure,
  type GoogleIdentitySignInResult,
} from "@/lib/client/googleIdentitySignIn";

const failureMessage: Record<GoogleIdentitySignInFailure, string> = {
  "popup-blocked": "認証画面を開けませんでした。ポップアップを許可して再試行してください。",
  "popup-closed": "認証画面が閉じられました。もう一度お試しください。",
  "popup-timeout": "認証画面の応答がありません。認証画面を閉じてから再試行してください。",
  "session-rejected": "ログイン情報を確認できませんでした。もう一度お試しください。",
  unexpected: "ログインを完了できませんでした。もう一度お試しください。",
};

export function GoogleIdentitySignInButton() {
  const [status, setStatus] = useState<"idle" | "working" | "failed">("idle");
  const [failure, setFailure] = useState<GoogleIdentitySignInFailure>("unexpected");
  const signInFlight = useRef(createSingleFlight<GoogleIdentitySignInResult>(
    async () => establishGoogleIdentitySession({
      openPopup: () => signInWithPopup(firebaseClientAuth(), googleIdentityProvider()),
      createSession: (idToken) => fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        credentials: "same-origin",
      }),
    }),
  ));

  const signIn = async () => {
    setStatus("working");
    const flight = await signInFlight.current();
    if (flight.status === "already-running") return;
    if (flight.value.status === "authenticated") {
      window.location.assign("/workspace");
      return;
    }
    setFailure(flight.value.reason);
    setStatus("failed");
  };

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={status === "working"}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-sm font-black text-zinc-900">G</span>
        {status === "working" ? "確認中…" : "Googleで続ける"}
      </button>
      {status === "failed" ? <p role="alert" className="mt-2 text-xs text-red-300">{failureMessage[failure]}</p> : null}
    </div>
  );
}
