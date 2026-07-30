export type PostgreSQLDrainRegistration = Readonly<{
  release(): void;
}>;

export type PostgreSQLDrainResult = Readonly<{
  status: "drained" | "drain-timeout";
  discardedCount: number;
}>;

type TrackedConnection = Readonly<{
  discard(): void;
}>;

export class PostgreSQLDrainCoordinator {
  private readonly tracked = new Set<TrackedConnection>();
  private emptyWaiter: (() => void) | undefined;

  register(connection: TrackedConnection): PostgreSQLDrainRegistration {
    this.tracked.add(connection);
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        this.tracked.delete(connection);
        if (this.tracked.size === 0) {
          const waiter = this.emptyWaiter;
          this.emptyWaiter = undefined;
          waiter?.();
        }
      },
    });
  }

  count(): number {
    return this.tracked.size;
  }

  async drain(timeoutMs: number): Promise<PostgreSQLDrainResult> {
    if (this.tracked.size === 0) {
      return Object.freeze({ status: "drained", discardedCount: 0 });
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const drained = new Promise<"drained">((resolve) => {
      this.emptyWaiter = () => resolve("drained");
    });
    const timedOut = new Promise<"drain-timeout">((resolve) => {
      timeoutHandle = setTimeout(() => resolve("drain-timeout"), timeoutMs);
    });
    const outcome = await Promise.race([drained, timedOut]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    this.emptyWaiter = undefined;

    if (outcome === "drained") {
      return Object.freeze({ status: "drained", discardedCount: 0 });
    }

    const remaining = [...this.tracked];
    for (const connection of remaining) connection.discard();
    this.tracked.clear();
    return Object.freeze({
      status: "drain-timeout",
      discardedCount: remaining.length,
    });
  }
}
