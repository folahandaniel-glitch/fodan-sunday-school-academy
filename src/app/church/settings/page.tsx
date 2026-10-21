import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { getOrgProfile, orgSettings } from "@/server/services/church";
import { ActionForm } from "@/components/forms";
import { newJoinCodeAction, settingsOrgAction } from "@/app/actions/staff";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Church settings" };
export const dynamic = "force-dynamic";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ChurchSettings() {
  const { ctx } = await requireOrg("org.settings");
  const [o, s] = [await getOrgProfile(ctx), orgSettings(ctx)];
  return (
    <>
      <PageHeader title="Church settings" sub="Local rules for scheduling, attendance, results and certificates." />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <ActionForm action={settingsOrgAction} submit="Save settings">
            <h2 className="text-lg">Teaching and results</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label" htmlFor="teachingWeekday">Weekly lesson day</label><select id="teachingWeekday" name="teachingWeekday" className="input" defaultValue={s.teachingWeekday}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
              <div><label className="label" htmlFor="lessonOpenDaysBefore">Lessons open (days before)</label><input id="lessonOpenDaysBefore" name="lessonOpenDaysBefore" type="number" min={0} max={7} className="input" defaultValue={s.lessonOpenDaysBefore} /></div>
              <div><label className="label" htmlFor="resultVisibility">Result visibility</label><select id="resultVisibility" name="resultVisibility" className="input" defaultValue={s.resultVisibility}><option value="after_publish">After a teacher releases them</option><option value="immediate">Immediately for objective tests</option></select></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="teachersPublishResults" className="h-4 w-4" defaultChecked={s.teachersPublishResults} /> Teachers may release results for their own classes</label>
            <h2 className="pt-2 text-lg">Membership</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoApprove" className="h-4 w-4" defaultChecked={o.autoApproveMembers} /> Approve new learners automatically (otherwise you approve each one)</label>
            <h2 className="pt-2 text-lg">Certificate requirements</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div><label className="label" htmlFor="minAttendance">Min attendance %</label><input id="minAttendance" name="minAttendance" type="number" min={0} max={100} className="input" defaultValue={s.certificate.minAttendancePercent} /></div>
              <div><label className="label" htmlFor="minCompletion">Min lessons completed %</label><input id="minCompletion" name="minCompletion" type="number" min={0} max={100} className="input" defaultValue={s.certificate.minLessonCompletionPercent} /></div>
              <div><label className="label" htmlFor="minScore">Min final score %</label><input id="minScore" name="minScore" type="number" min={0} max={100} className="input" defaultValue={s.certificate.minScorePercent} /></div>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="requireFinalExam" className="h-4 w-4" defaultChecked={s.certificate.requireFinalExam} /> Final exam required</label>
            </div>
          </ActionForm>
        </Card>
        <Card><h2 className="text-lg">Join code</h2><p className="mt-1 text-sm text-mist">Members who enter this code when they register are approved immediately. Change it if it is shared too widely.</p><p className="mt-2 font-mono text-2xl text-navy">{o.joinCode ?? "none"}</p>
          <ActionForm action={newJoinCodeAction} submit="Generate a new code" className="mt-3" confirm="Generate a new code? The old code stops working."><span /></ActionForm></Card>
      </div>
    </>
  );
}
