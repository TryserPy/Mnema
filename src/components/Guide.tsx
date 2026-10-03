// Знакомство: 5 коротких шагов с рисунками. Всегда можно «Пропустить»; вернуться — «Настройки → О Мнеме → Пройти знакомство».
import { useEffect, useState, type ReactNode } from 'react';
import { addExample } from '../seed';
import { updateSettings, useData } from '../store';
import { IlluMake, IlluNote, IlluSpaced, IlluStart, IlluTree } from './Illustrations';
import { Icon, Modal, selHow } from './ui';
import '../guide.css';

let opener: (() => void) | null = null;
/** Открыть знакомство из любого места (Настройки → О Мнеме). */
export const openGuide = () => opener?.();

const STEPS: { title: string; text: ReactNode; pic: ReactNode }[] = [
  { title: 'Предмет и тема', text: <>Начни с предмета, например «Биология». В нём — темы: одна тема — один параграф или раздел учебника.</>, pic: <IlluTree /> },
  { title: 'Конспект своими словами', text: <>Запиши главное коротко и своими словами: так ты сразу начинаешь понимать, а не просто переписывать.</>, pic: <IlluNote /> },
  { title: 'Из важного — карточки', text: <>Выдели нужное: в тексте {selHow('В карточку')}. Одна карточка — один факт.</>, pic: <IlluMake /> },
  { title: 'Каждый день — «Учиться»', text: <>Одна кнопка на главном экране. Сначала вспомни ответ сам, потом открывай — и честно оцени. Хватит 10 минут.</>, pic: <IlluStart /> },
  { title: 'Мнема напомнит вовремя', text: <>Она сама решает, когда повторить каждую карточку: чуть раньше, чем ты забудешь. Чем лучше помнишь, тем реже она появляется.</>, pic: <IlluSpaced /> }
];

export function GuideHost({ onNewSubject }: { onNewSubject: () => void }) {
  const data = useData();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    opener = () => setOpen(true);
    return () => {
      opener = null;
    };
  }, []);
  // Самый первый запуск: пустое приложение — предлагаем знакомство один раз.
  useEffect(() => {
    if (!data.settings.onboarded && data.subjects.length === 0) setOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const close = () => {
    setOpen(false);
    if (!data.settings.onboarded) updateSettings({ onboarded: true });
  };
  return <Guide onClose={close} onNewSubject={() => (close(), onNewSubject())} onExample={() => (addExample(), close())} />;
}

function Guide({ onClose, onNewSubject, onExample }: { onClose: () => void; onNewSubject: () => void; onExample: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const st = STEPS[i];
  return (
    <Modal title="Знакомство с Мнемой" onClose={onClose} width={520}>
      <div className="guide">
        <div className="guide-pic">{st.pic}</div>
        <div className="guide-body guide-step" key={i}>
          <h3>
            {i + 1}. {st.title}
          </h3>
          <p>{st.text}</p>
        </div>
        <div className="guide-dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <div className="guide-foot">
          <button className="btn ghost" onClick={onClose}>
            Пропустить
          </button>
          <span className="row gap8 wrap">
            {i > 0 && (
              <button className="btn" onClick={() => setI(i - 1)}>
                Назад
              </button>
            )}
            {last ? (
              <>
                <button className="btn" onClick={onExample}>
                  Посмотреть на примере
                </button>
                <button className="btn primary" onClick={onNewSubject}>
                  <Icon name="plus" size={18} /> Добавить предмет
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setI(i + 1)}>
                Дальше
              </button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}
