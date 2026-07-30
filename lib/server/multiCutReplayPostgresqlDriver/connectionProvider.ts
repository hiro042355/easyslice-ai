import type {
  MultiCutReplayPostgresqlConnectionProvider,
  MultiCutReplayPostgresqlTransactionConnection,
} from "../multiCutReplayPostgresqlExecutionRuntime";
import { mapMultiCutReplayPostgresqlDriverError } from "./errorMapping";
import type {
  MultiCutReplayPostgresqlDriver,
  MultiCutReplayPostgresqlDriverConnection,
} from "./types";

export const createMultiCutReplayPostgresqlDriverConnectionProvider = (
  driver: MultiCutReplayPostgresqlDriver,
): MultiCutReplayPostgresqlConnectionProvider => {
  const connections = new WeakMap<
    MultiCutReplayPostgresqlTransactionConnection,
    MultiCutReplayPostgresqlDriverConnection
  >();
  return Object.freeze({
    async acquire() {
      let driverConnection: MultiCutReplayPostgresqlDriverConnection;
      try {
        driverConnection = await driver.acquire();
      } catch (failure) {
        throw mapMultiCutReplayPostgresqlDriverError(failure);
      }
      const connection: MultiCutReplayPostgresqlTransactionConnection =
        Object.freeze({
          async begin() {
            try {
              await driverConnection.begin();
            } catch (failure) {
              throw mapMultiCutReplayPostgresqlDriverError(failure);
            }
          },
          async execute(request) {
            try {
              return await driverConnection.query(request);
            } catch (failure) {
              throw mapMultiCutReplayPostgresqlDriverError(failure);
            }
          },
          async commit() {
            try {
              await driverConnection.commit();
            } catch (failure) {
              throw mapMultiCutReplayPostgresqlDriverError(failure);
            }
          },
          async rollback() {
            try {
              await driverConnection.rollback();
            } catch (failure) {
              throw mapMultiCutReplayPostgresqlDriverError(failure);
            }
          },
        });
      connections.set(connection, driverConnection);
      return connection;
    },
    async release(connection) {
      const driverConnection = connections.get(connection);
      if (!driverConnection) {
        throw mapMultiCutReplayPostgresqlDriverError({
          errorVersion: "1.0",
          kind: "transaction-rejected",
          safeReason: "unknown-driver-connection",
        });
      }
      try {
        await driver.release(driverConnection);
        connections.delete(connection);
      } catch (failure) {
        throw mapMultiCutReplayPostgresqlDriverError(failure);
      }
    },
  });
};
