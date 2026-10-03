// Интерактивные примеры для справки: маленькая «игрушечная» Мнема, где можно понажимать и увидеть, как это работает,
// ничего не меняя в своих данных. Мигающая кнопка — та, которую нажать дальше.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, Modal } from './ui';
import '../demos.css';

export type DemoId = 'wifi' | 'cloud' | 'learn' | 'mistake' | 'card' | 'copy' | 'trash';

interface Frame {
  text: ReactNode;
  scene: (next: () => void) => ReactNode;
  /** Пройти дальше само через столько мс (анимация «идёт перенос»). */
  auto?: number;
}

const Btn = ({ children, onClick, hot = true, kind = '' }: { children: ReactNode; onClick?: () => void; hot?: boolean; kind?: string }) => (
  <button type="button" className={'mock-btn ' + kind + (hot && onClick ? ' hot' : '')} onClick={onClick} disabled={!onClick} tabIndex={onClick ? 0 : -1}>
    {children}
  </button>
);
const Laptop = ({ children, title = 'Мнема' }: { children: ReactNode; title?: string }) => (
  <div className="mock-laptop">
    <div className="mock-bar">
      <i />
      <i />
      <i />
      <span>{title}</span>
    </div>
    <div className="mock-body">{children}</div>
  </div>
);
const Phone = ({ children }: { children: ReactNode }) => (
  <div className="mock-phone">
    <div className="mock-notch" />
    <div className="mock-body">{children}</div>
  </div>
);
const Row = ({ label, children, hint }: { label: string; hint?: string; children?: ReactNode }) => (
  <div className="mock-row">
    <span className="mock-row-text">
      <b>{label}</b>
      {hint && <small>{hint}</small>}
    </span>
    {children}
  </div>
);
const Qr = () => (
  <div className="mock-qr" aria-hidden="true">
    {Array.from({ length: 49 }, (_, i) => (
      <i key={i} className={(i * 37 + (i % 7) * 11) % 3 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? 'on' : ''} />
    ))}
  </div>
);
const Done = ({ children }: { children: ReactNode }) => (
  <div className="mock-done">
    <Icon name="check" size={18} /> {children}
  </div>
);

const DEMOS: Record<DemoId, { title: string; frames: Frame[] }> = {
  wifi: {
    title: 'Пример: перенос по Wi-Fi',
    frames: [
      {
        text: 'На компьютере открой «Настройки → Данные». Нажми «Открыть» у «Синхронизации по Wi-Fi».',
        scene: (next) => (
          <Laptop title="Настройки · Данные">
            <Row label="Автокопии" hint="каждый день" />
            <Row label="Синхронизация по Wi-Fi" hint="одна сеть, код с экрана">
              <Btn onClick={next}>Открыть</Btn>
            </Row>
            <Row label="Облако" hint="Яндекс Диск, Nextcloud" />
          </Laptop>
        )
      },
      {
        text: 'Компьютер показал код. На телефоне — то же место, нажми «Сканировать».',
        scene: (next) => (
          <div className="mock-pair">
            <Laptop title="Синхронизация">
              <Qr />
              <small className="mock-cap">Наведи камеру телефона</small>
            </Laptop>
            <Phone>
              <Row label="Wi-Fi" />
              <Btn onClick={next}>
                <Icon name="camera" size={14} /> Сканировать
              </Btn>
            </Phone>
          </div>
        )
      },
      {
        text: 'Наведи камеру на код…',
        auto: 1400,
        scene: () => (
          <div className="mock-pair">
            <Laptop title="Синхронизация">
              <Qr />
            </Laptop>
            <Phone>
              <div className="mock-viewfinder">
                <Qr />
                <span className="mock-scanline" />
              </div>
            </Phone>
          </div>
        )
      },
      {
        text: 'Устройства обмениваются изменениями — ничего не теряется, удалённое удаляется везде.',
        auto: 1800,
        scene: () => (
          <div className="mock-pair">
            <Laptop title="Синхронизация">
              <Icon name="sync" size={40} />
            </Laptop>
            <div className="mock-flow" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <Phone>
              <Icon name="sync" size={30} />
            </Phone>
          </div>
        )
      },
      {
        text: 'Готово! Если Windows спросит про брандмауэр — разреши доступ. Оба устройства должны быть в одной сети Wi-Fi.',
        scene: () => (
          <div className="mock-pair">
            <Laptop title="Синхронизация">
              <Done>Объединено</Done>
            </Laptop>
            <Phone>
              <Done>Готово</Done>
            </Phone>
          </div>
        )
      }
    ]
  },
  cloud: {
    title: 'Пример: облако',
    frames: [
      {
        text: '«Настройки → Данные → Облако» — нажми «Подключить».',
        scene: (next) => (
          <Laptop title="Настройки · Данные">
            <Row label="Синхронизация по Wi-Fi" />
            <Row label="Облако" hint="Яндекс Диск, Nextcloud">
              <Btn onClick={next}>Подключить</Btn>
            </Row>
          </Laptop>
        )
      },
      {
        text: 'Адрес, логин и пароль приложения (для Яндекс Диска его создают в настройках Яндекса). Можно добавить свой пароль шифрования — облако увидит только шифр.',
        scene: (next) => (
          <Laptop title="Облако">
            <div className="mock-field">https://webdav.yandex.ru</div>
            <div className="mock-field">ученик@yandex.ru</div>
            <div className="mock-field">••••••••••</div>
            <Btn onClick={next}>Подключить</Btn>
          </Laptop>
        )
      },
      {
        text: 'Мнема сама отправляет и забирает изменения — на всех устройствах, где облако подключено.',
        auto: 1800,
        scene: () => (
          <div className="mock-pair">
            <Laptop>
              <Icon name="cloud" size={36} />
            </Laptop>
            <div className="mock-flow up" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <Phone>
              <Icon name="cloud" size={28} />
            </Phone>
          </div>
        )
      },
      { text: 'Готово — теперь всё под рукой и на телефоне, и на компьютере.', scene: () => <Done>Облако подключено</Done> }
    ]
  },
  learn: {
    title: 'Пример: «Учиться»',
    frames: [
      {
        text: 'На «Сегодня» одна кнопка — «Учиться». Мнема сама собрала план.',
        scene: (next) => (
          <Laptop title="Сегодня">
            <div className="mock-hero">
              <b>16</b> карточек · около 5 мин
              <Btn onClick={next} kind="wide">
                <Icon name="play" size={14} /> Учиться
              </Btn>
            </div>
          </Laptop>
        )
      },
      {
        text: 'Сначала вспомни ответ сам — только потом открывай.',
        scene: (next) => (
          <Laptop title="Повторение">
            <div className="mock-card">Что такое наречие?</div>
            <Btn onClick={next} kind="wide">
              Показать ответ
            </Btn>
          </Laptop>
        )
      },
      {
        text: 'Честно оцени. «Хорошо» — вспомнил; «Снова» — не вспомнил, карточка вернётся скоро.',
        scene: (next) => (
          <Laptop title="Повторение">
            <div className="mock-card">
              Что такое наречие?
              <small>Неизменяемая часть речи: признак действия или признака.</small>
            </div>
            <div className="mock-grades">
              <Btn hot={false}>Снова</Btn>
              <Btn hot={false}>Трудно</Btn>
              <Btn onClick={next}>Хорошо</Btn>
              <Btn hot={false}>Легко</Btn>
            </div>
          </Laptop>
        )
      },
      { text: 'Мнема покажет эту карточку снова через несколько дней — чуть раньше, чем ты забудешь.', scene: () => <Done>Вернётся через 3 дня</Done> }
    ]
  },
  mistake: {
    title: 'Пример: если ошибся',
    frames: [
      {
        text: 'Ответ открыт — и ты ошибся. Отметь, что случилось: например, «Перепутал».',
        scene: (next) => (
          <Laptop title="Повторение">
            <div className="mock-card">
              Столица Австралии?
              <small>Канберра</small>
            </div>
            <div className="mock-grades">
              <Btn hot={false}>Не помню</Btn>
              <Btn onClick={next}>Перепутал</Btn>
              <Btn hot={false}>Не понял</Btn>
            </div>
          </Laptop>
        )
      },
      {
        text: 'Причина отмечена — карточка никуда не делась. Теперь нажми «Снова».',
        scene: (next) => (
          <Laptop title="Повторение">
            <div className="mock-card">
              Столица Австралии?
              <small>Канберра</small>
            </div>
            <div className="mock-grades">
              <Btn onClick={next} kind="again">
                Снова
              </Btn>
              <Btn hot={false} kind="on">
                Перепутал ✓
              </Btn>
            </div>
          </Laptop>
        )
      },
      { text: 'Карточка вернётся скоро, а в итоге занятия будет «Что пошло не так: перепутал — 1» и кнопка «Повторить ошибки».', scene: () => <Done>Причина записана</Done> }
    ]
  },
  card: {
    title: 'Пример: карточка из конспекта',
    frames: [
      {
        text: 'Нажми на главную мысль в конспекте — «выдели» её.',
        scene: (next) => (
          <Laptop title="§1 Клетка">
            <p className="mock-text">
              Клетка — это{' '}
              <button type="button" className="mock-mark hot" onClick={next}>
                наименьшая единица строения и жизни
              </button>{' '}
              всех организмов.
            </p>
          </Laptop>
        )
      },
      {
        text: 'Появилось меню выделенного. Нажми «В карточку».',
        scene: (next) => (
          <Laptop title="§1 Клетка">
            <p className="mock-text">
              Клетка — это <mark>наименьшая единица строения и жизни</mark> всех организмов.
            </p>
            <div className="mock-pop">
              <Btn onClick={next} kind="wide">
                <Icon name="cardPlus" size={14} /> В карточку
              </Btn>
              <Btn hot={false}>Ссылка</Btn>
            </div>
          </Laptop>
        )
      },
      {
        text: 'Мнема сама предложила вопрос и ответ. Поправь, если нужно, и нажми «Сохранить».',
        scene: (next) => (
          <Laptop title="Новая карточка">
            <div className="mock-field">Что такое клетка?</div>
            <div className="mock-field">Наименьшая единица строения и жизни</div>
            <Btn onClick={next}>Сохранить</Btn>
          </Laptop>
        )
      },
      { text: 'Карточка готова — она попадёт в «Учиться». Одна карточка — один факт.', scene: () => <Done>Карточка добавлена</Done> }
    ]
  },
  copy: {
    title: 'Пример: Ctrl+C / Ctrl+V',
    frames: [
      {
        text: 'Ctrl+щелчок выбирает несколько тем. Выбери «§1 Клетка».',
        scene: (next) => (
          <Laptop title="Предметы">
            <div className="mock-tree">
              <b>Биология</b>
              <button type="button" className="mock-tree-row hot" onClick={next}>
                §1 Клетка
              </button>
              <span className="mock-tree-row">§2 Ткани</span>
              <b>Химия</b>
            </div>
          </Laptop>
        )
      },
      {
        text: 'Нажми Ctrl+C — тема скопирована.',
        scene: (next) => (
          <Laptop title="Предметы">
            <div className="mock-tree">
              <b>Биология</b>
              <span className="mock-tree-row on">§1 Клетка</span>
              <span className="mock-tree-row">§2 Ткани</span>
              <b>Химия</b>
            </div>
            <Btn onClick={next} kind="key">
              Ctrl + C
            </Btn>
          </Laptop>
        )
      },
      {
        text: 'Открой место, куда вставить (например, «Химия»), и нажми Ctrl+V.',
        scene: (next) => (
          <Laptop title="Химия">
            <div className="mock-tree">
              <b>Биология</b>
              <span className="mock-tree-row">§1 Клетка</span>
              <b className="on">Химия</b>
            </div>
            <Btn onClick={next} kind="key">
              Ctrl + V
            </Btn>
          </Laptop>
        )
      },
      {
        text: 'Копия со всем внутри — конспектом, подтемами и карточками. Прогресс не копируется.',
        scene: () => (
          <Laptop title="Химия">
            <div className="mock-tree">
              <b>Химия</b>
              <span className="mock-tree-row new">§1 Клетка</span>
            </div>
            <Done>Вставлено</Done>
          </Laptop>
        )
      }
    ]
  },
  trash: {
    title: 'Пример: удалил по ошибке',
    frames: [
      {
        text: 'Удали тему — не бойся.',
        scene: (next) => (
          <Laptop title="Биология">
            <Row label="§3 Ткани">
              <Btn onClick={next} kind="danger">
                Удалить
              </Btn>
            </Row>
          </Laptop>
        )
      },
      {
        text: 'Внизу появилось «Вернуть» — нажми.',
        scene: (next) => (
          <Laptop title="Биология">
            <div className="mock-empty">Тема удалена</div>
            <div className="mock-toast">
              Тема удалена{' '}
              <button type="button" className="mock-link hot" onClick={next}>
                Вернуть
              </button>
            </div>
          </Laptop>
        )
      },
      { text: 'Всё вернулось. А если «Вернуть» уже пропало — тема ещё 30 дней лежит в «Профиль → Корзина».', scene: () => <Done>«§3 Ткани» на месте</Done> }
    ]
  }
};

export function DemoModal({ id, onClose }: { id: DemoId; onClose: () => void }) {
  const demo = DEMOS[id];
  const [i, setI] = useState(0);
  const f = demo.frames[i];
  const last = i === demo.frames.length - 1;
  const next = () => setI((k) => Math.min(k + 1, demo.frames.length - 1));
  useEffect(() => {
    if (!f.auto) return;
    const t = setTimeout(next, f.auto);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={demo.title} onClose={onClose} width={560}>
      <div className="demo">
        <div className="demo-stage" key={i}>
          {f.scene(next)}
        </div>
        <p className="demo-text">{f.text}</p>
        <div className="demo-foot">
          <span className="demo-dots" aria-hidden="true">
            {demo.frames.map((_, k) => (
              <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />
            ))}
          </span>
          {last ? (
            <span className="row gap8">
              <button className="btn small" onClick={() => setI(0)}>
                Ещё раз
              </button>
              <button className="btn small primary" onClick={onClose}>
                Понятно
              </button>
            </span>
          ) : (
            <span className="small muted">{f.auto ? 'Смотри…' : 'Нажми мигающую кнопку'}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
