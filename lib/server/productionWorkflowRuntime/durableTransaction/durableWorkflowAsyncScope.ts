import { AsyncLocalStorage } from "node:async_hooks";

type DurableWorkflowAsyncScopeMarker = Readonly<{ managerToken: object; lineageToken: object }>;

export class DurableWorkflowAsyncScopeOwner {
  private readonly storage = new AsyncLocalStorage<DurableWorkflowAsyncScopeMarker>();

  isNested(managerToken: object): boolean {
    return this.storage.getStore()?.managerToken === managerToken;
  }

  run<T>(managerToken: object, operation: () => Promise<T>): Promise<T> {
    const marker = Object.freeze({ managerToken, lineageToken: Object.freeze({}) });
    return this.storage.run(marker, operation);
  }
}
