import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

export const pk = () => uuid("id").primaryKey().defaultRandom();
export const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
export const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
  toDriver(v) { return v; },
  fromDriver(v) { return Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array); },
});
