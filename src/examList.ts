// Контрольные: записанные (`AppData.exams`) и «на лету» из старых дат у тем (`Topic.examDate`). Только данные, без расчётов дат — чтобы модуль могли подключать и srs.ts, и экраны.
import type { AppData, Exam } from './types';

export interface ExamView extends Exam {
  /** true — контрольная ещё не записана, это дата у одной темы (`Topic.examDate`); при первом изменении она станет записанной. */
  virtual: boolean;
}

export const examIdOfTopic = (topicId: string) => 'topic:' + topicId;

/** Все контрольные по порядку дат. Тема из записанной контрольной (или её подтема) отдельной строкой не повторяется. */
export function examsOf(data: AppData): ExamView[] {
  const topics = new Map(data.topics.map((t) => [t.id, t]));
  const subjects = new Set(data.subjects.map((s) => s.id));
  const out: ExamView[] = [];
  const covered = new Set<string>();
  for (const e of data.exams ?? []) {
    const ids = e.topicIds.filter((id) => topics.has(id));
    if (!ids.length || !subjects.has(e.subjectId)) continue;
    for (const id of ids) covered.add(id);
    out.push({ ...e, topicIds: ids, virtual: false });
  }
  for (const t of data.topics) {
    if (!t.examDate || t.kind || covered.has(t.id)) continue;
    let p = t.parentId;
    let inside = false;
    const seen = new Set<string>([t.id]); // на случай петли в родителях (две темы друг у друга под собой) — не зависаем
    while (p && !seen.has(p)) {
      if (covered.has(p)) {
        inside = true;
        break;
      }
      seen.add(p);
      p = topics.get(p)?.parentId;
    }
    if (inside) continue;
    out.push({ id: examIdOfTopic(t.id), subjectId: t.subjectId, name: t.name, date: t.examDate, topicIds: [t.id], createdAt: t.createdAt, updatedAt: t.updatedAt, virtual: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name), 'ru'));
}

export function examById(data: AppData, id: string): ExamView | null {
  return examsOf(data).find((e) => e.id === id) ?? null;
}
