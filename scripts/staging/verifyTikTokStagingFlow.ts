/**
 * BLK-05 staging smoke CLI.
 *
 *   npx tsx scripts/staging/verifyTikTokStagingFlow.ts
 *     Dry run: prints the checks and exits without any network request.
 *
 *   STAGING_SMOKE_APPROVED=YES npx tsx scripts/staging/verifyTikTokStagingFlow.ts \
 *     --execute --base-url https://staging.nexcut.app
 *     Runs the unauthenticated readiness/auth-boundary checks against the
 *     approved staging origin. No OAuth, upload or publish is performed.
 */
import {
  SMOKE_APPROVAL_ENV,
  SMOKE_APPROVAL_TOKEN,
  resolveSmokeBaseUrl,
  runStagingSmoke,
  type SmokeFetch,
} from "../../lib/staging/stagingSmoke";
import { STAGING_APP_ORIGIN } from "../../lib/staging/stagingEnvironment";

interface Arguments {
  readonly execute: boolean;
  readonly baseUrl: string;
  readonly allowLoopback: boolean;
  readonly json: boolean;
}

function parseArguments(argv: readonly string[]): Arguments {
  let execute = false;
  let baseUrl: string = STAGING_APP_ORIGIN;
  let allowLoopback = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") execute = true;
    else if (argument === "--json") json = true;
    else if (argument === "--allow-loopback") allowLoopback = true;
    else if (argument === "--base-url") {
      baseUrl = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      printPlan();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { execute, baseUrl, allowLoopback, json };
}

function printPlan(): void {
  console.log("BLK-05 staging smoke (unauthenticated, read-only)");
  console.log(`  staging origin: ${STAGING_APP_ORIGIN}`);
  console.log("  checks:");
  console.log("    health-live                  GET  /api/health/live        -> 200 status=live");
  console.log("    health-ready                 GET  /api/health/ready       -> 200 status=ready");
  console.log("    import-cross-origin-rejected POST /api/v1/assets/import    -> 403 forbidden");
  console.log("    import-auth-boundary         POST /api/v1/assets/import    -> 401");
  console.log("    media-admit-auth-boundary    POST /api/media/admit         -> 401");
  console.log("    no-secret-leakage            responses free of token-shaped values");
  console.log("");
  console.log("  execute (after approval):");
  console.log(`    ${SMOKE_APPROVAL_ENV}=${SMOKE_APPROVAL_TOKEN} npx tsx ${process.argv[1]} --execute`);
  console.log("  Not covered here: OAuth sign-in, upload, TikTok publication (approval-gated, BLK-05/07).");
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const baseUrl = resolveSmokeBaseUrl(args.baseUrl, args.allowLoopback);

  if (!args.execute) {
    printPlan();
    console.log("");
    console.log(`DRY_RUN: no request was sent to ${baseUrl}.`);
    return;
  }

  const fetchImpl = globalThis.fetch as unknown as SmokeFetch;
  const report = await runStagingSmoke(baseUrl, {
    fetch: fetchImpl,
    approval: process.env[SMOKE_APPROVAL_ENV],
    allowLoopback: args.allowLoopback,
    log: args.json ? () => undefined : (line) => console.log(line),
  });

  if (args.json) console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : report.status === "BLOCKED" ? 2 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "staging-smoke-failed");
  process.exitCode = 1;
});
