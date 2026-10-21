import { Tabs } from "./ui";

export function VersionTabs({ id, versionId, current }: { id: string; versionId: string; current: string }) {
  const b = `/admin/curricula/${id}/v/${versionId}`;
  return <Tabs current={current} items={[{ key: "lessons", label: "26-week lessons", href: b }, { key: "questions", label: "Question bank", href: `${b}/questions` }, { key: "blueprints", label: "Assessment blueprints", href: `${b}/blueprints` }, { key: "export", label: "Preview and export", href: `${b}/export` }]} />;
}
