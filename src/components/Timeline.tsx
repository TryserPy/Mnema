// Лента времени предмета: все даты из конспектов по порядку — удобно для истории.
import { useMemo } from 'react';
import { findImportant, yearOf } from '../important';
import type { AppData, Route } from '../types';

export interface TimelineEvent {
  year: number;
  date: string;
  sentence: string;
  topicId: string;
  topicName: string;
  page?: number;
}

export function timelineEvents(data: AppData, subjectId: string): TimelineEvent[] {
  const hs = { ...data.settings.highlight, rules: { ...data.settings.highlight.rules, date: true } };
  const out: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const t of data.topics.filter((x) => x.subjectId === subjectId)) {
    for (const it of findImportant(t.note, hs)) {
      if (it.type !== 'date') continue;
      const y = yearOf(it.text);
      if (y === null || y < 1 || y > 2100) continue;
      const key = y + '|' + it.sentence;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ year: y, date: it.text, sentence: it.sentence, topicId: t.id, topicName: t.name, page: it.page });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

function century(y: number) {
  const c = Math.floor((y - 1) / 100) + 1;
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][c] ?? String(c);
  return `${roman} век`;
}

export function Timeline({ data, subjectId, color, go }: { data: AppData; subjectId: string; color: string; go: (r: Route) => void }) {
  const events = useMemo(() => timelineEvents(data, subjectId), [data, subjectId]);
  if (!events.length) return <div className="empty">Дат пока нет. Когда в конспектах появятся годы и даты, здесь выстроится лента времени.</div>;
  let lastC = '';
  return (
    <div className="timeline" style={{ ['--c' as string]: color }}>
      {events.map((e, i) => {
        const c = century(e.year);
        const head = c !== lastC;
        lastC = c;
        return (
          <div key={i} className="tl-wrap" style={{ animationDelay: Math.min(i, 20) * 35 + 'ms' }}>
            {head && <div className="tl-century">{c}</div>}
            <button className="tl-item" onClick={() => go({ name: 'topic', id: e.topicId, tab: 'note' })}>
              <span className="tl-dot" />
              <span className="tl-date">{e.date}</span>
              <span className="tl-text">{e.sentence}</span>
              <span className="tl-topic muted small">
                {e.topicName}
                {e.page ? ` · стр. ${e.page}` : ''}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
