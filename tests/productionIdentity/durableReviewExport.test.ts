import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStoredReviewQueueItems,
  resolveReviewExportPath,
  saveReviewQueueItems,
  type ReviewQueueItem,
} from "../../lib/reviewQueue";

const EXPORT_ID = "44444444-4444-4444-8444-444444444444";
const workspace = readFileSync("app/workspace-flow/page.tsx", "utf8");
const review = readFileSync("app/review/page.tsx", "utf8");
const retrieval = readFileSync("app/api/exports/[exportId]/route.ts", "utf8");

const item = (overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
  id: "review-test",
  videoTitle: "Export",
  description: "Review export",
  hashtags: ["#NEXCUT"],
  platform: "youtube",
  postingTime: "18:00",
  creatorStyle: "standard",
  animationIntensity: 3,
  aiHookEnabled: false,
  status: "ready-for-review",
  reviewStatus: "ready-for-review",
  createdAt: "2026-08-14T00:00:00.000Z",
  ...overrides,
});

test("successful Cut preserves only the server-issued durable Export ID", () => {
  const header = workspace.indexOf('res.headers.get("X-Nexcut-Export-Id")');
  const validation = workspace.indexOf("isDurableExportId(exportId)");
  const blob = workspace.indexOf("await res.blob()", header);
  const queue = workspace.indexOf("addReviewQueueItem(reviewQueueItem)", blob);
  assert.ok(header > 0 && validation > header && blob > validation && queue > blob);
  assert.match(workspace, /reviewQueueItem:[\s\S]*exportId,/);
  assert.doesNotMatch(workspace, /exportedVideoPath:\s*url/);
});

test("Review handoff appears only after durable queue persistence", () => {
  assert.match(workspace, /reviewExportReady, setReviewExportReady\] = useState\(false\)/);
  assert.match(workspace, /setReviewExportReady\(false\)/);
  const persistence = workspace.indexOf("addReviewQueueItem(reviewQueueItem)");
  const enable = workspace.indexOf("setReviewExportReady(true)");
  const action = workspace.indexOf("{reviewExportReady && (");
  assert.ok(persistence > 0 && enable > persistence && action > enable);
  assert.match(workspace.slice(action), /href="\/review"[\s\S]*Review Queueへ/);
  assert.match(workspace, /href=\{downloadUrl\}[\s\S]*download="creator-flow-cut\.mp4"[\s\S]*MP4を保存/);
});

test("missing or malformed Export ID fails before a legacy Review item is created", () => {
  assert.match(workspace, /if \(!isDurableExportId\(exportId\)\)[\s\S]*throw new Error/);
  assert.equal(resolveReviewExportPath(item()), undefined);
  assert.equal(resolveReviewExportPath(item({ exportId: "client-storage-key" })), undefined);
});

test("localStorage preserves Export identity but removes blob URL authority", () => {
  let stored = "";
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => stored || null,
        setItem: (_key: string, value: string) => { stored = value; },
      },
    },
  });
  try {
    saveReviewQueueItems([item({ exportId: EXPORT_ID, exportedVideoPath: "blob:ephemeral" })]);
    const [reloaded] = getStoredReviewQueueItems();
    assert.equal(reloaded?.exportId, EXPORT_ID);
    assert.equal(reloaded?.exportedVideoPath, undefined);
    assert.equal(resolveReviewExportPath(reloaded!), `/api/exports/${EXPORT_ID}`);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("Review derives download authority from Export ID and classifies legacy items", () => {
  assert.match(review, /resolveReviewExportPath\(item\)/);
  assert.match(review, /Legacy media preview is unavailable after reload/);
  assert.doesNotMatch(review, /href=\{item\.exportedVideoPath\}/);
});

test("Export retrieval enforces session and owner lookup before DB-derived GCS access", () => {
  const authentication = retrieval.indexOf("requireAuthenticatedRequest(request)");
  const lookup = retrieval.indexOf("resolveOwnedExport(exportId, ownerUid)");
  const storage = retrieval.indexOf("file(exported.storageKey).download()");
  assert.ok(authentication > 0 && lookup > authentication && storage > lookup);
  assert.match(retrieval, /resource-not-found[\s\S]*status: 404/);
  assert.doesNotMatch(retrieval, /searchParams|get\(["'](?:uid|userId|storageKey|filename)["']\)/);
  assert.doesNotMatch(retrieval, /storageKey["']\s*:/);
});
