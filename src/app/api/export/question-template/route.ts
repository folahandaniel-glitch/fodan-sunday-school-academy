import { QUESTION_CSV_TEMPLATE } from "@/server/services/import";

export const dynamic = "force-static";

export function GET() {
  return new Response(QUESTION_CSV_TEMPLATE, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="question-import-template.csv"' } });
}
