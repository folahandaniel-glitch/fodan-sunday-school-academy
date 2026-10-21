"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/guards";
import { markAllRead } from "@/server/services/notify";

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/app/notifications");
}
