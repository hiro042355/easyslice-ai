import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const validationPhases = Object.freeze([
  "validate:postgresql-reconciliation-foundation",
  "lint",
  "build",
]);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveNpmExecPath() {
  const candidate = process.env.npm_execpath;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return { ok: false, reason: "npm-execpath-missing" };
  }
  if (!isAbsolute(candidate) || basename(candidate).toLowerCase() !== "npm-cli.js") {
    return { ok: false, reason: "npm-execpath-invalid" };
  }
  try {
    if (!statSync(candidate).isFile()) {
      return { ok: false, reason: "npm-execpath-invalid" };
    }
  } catch {
    return { ok: false, reason: "npm-execpath-unavailable" };
  }
  return { ok: true, value: candidate };
}

function runNpmScript(npmExecPath, scriptName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [npmExecPath, "run", scriptName], {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    const signalHandlers = new Map(
      ["SIGINT", "SIGTERM"].map((signal) => [
        signal,
        () => forwardSignal(signal),
      ]),
    );
    for (const [signal, handler] of signalHandlers) {
      process.once(signal, handler);
    }

    const removeSignalHandlers = () => {
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler);
      }
    };

    child.once("error", () => {
      removeSignalHandlers();
      resolve({ code: 1, signal: null });
    });
    child.once("exit", (code, signal) => {
      removeSignalHandlers();
      resolve({ code: code ?? 1, signal });
    });
  });
}

async function main() {
  const npmExecPath = resolveNpmExecPath();
  if (!npmExecPath.ok) {
    console.error(
      `[repository-validation] bootstrap failed: ${npmExecPath.reason}`,
    );
    process.exitCode = 1;
    return;
  }

  for (const [index, scriptName] of validationPhases.entries()) {
    console.log(
      `[repository-validation] phase ${index + 1}/${validationPhases.length}: ${scriptName}`,
    );
    const result = await runNpmScript(npmExecPath.value, scriptName);

    if (result.signal) {
      console.error(
        `[repository-validation] phase terminated by signal: ${scriptName}`,
      );
      try {
        process.kill(process.pid, result.signal);
      } catch {
        process.exitCode = 1;
      }
      return;
    }

    if (result.code !== 0) {
      console.error(
        `[repository-validation] phase failed: ${scriptName}`,
      );
      process.exitCode = result.code;
      return;
    }
  }

  console.log("[repository-validation] all phases completed successfully.");
}

await main();
