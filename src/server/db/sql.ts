import { getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Fully qualified id of an outer table for use inside a correlated sub-select.
 * Drizzle prints a bare "id" when the outer query selects from one table; inside a sub-select that joins tables which also have an id column,
 * Postgres then reports the reference as ambiguous (or silently binds it to the wrong table).
 */
export const qid = (table: PgTable) => sql`${sql.identifier(getTableName(table))}.${sql.identifier("id")}`;
