import { useState, type ReactNode } from 'react';
import { Collapse, Icon, Segmented, selHow, touchUI } from '../components/ui';
import { IlluMake, IlluMix, IlluNote, IlluRecall, IlluSpaced, IlluTree } from '../components/Illustrations';
import { startTutorial } from '../components/Tutorial';
import type { Route } from '../types';
import '../guide.css';

type Section = 'learn' | 'use';

/** Три главные идеи — с рисунком и тем, что можно попробовать прямо сейчас. */
function Learn({ go }: { go: (r: Route) => void }) {
  return (
    <div className="stack gap16">
      <div className="card idea">
        <IlluRecall />
        <div className="idea-text">
          <h3>1. Вспоминай, а не перечитывай</h3>
          <p>Перечитывать приятно, но запоминается слабо. Когда ты сам достаёшь ответ из головы — это и есть учёба.</p>
          <p className="small muted">Попробуй: закрой конспект и расскажи тему своими словами, потом сравни.</p>
          <div className="row gap8 wrap">
            <button className="btn small primary" onClick={() => go({ name: 'today' })}>
              Учиться
            </button>
            <button className="btn small" onClick={() => go({ name: 'knowledge' })}>
              Выбрать тему
            </button>
          </div>
        </div>
      </div>
      <div className="card idea">
        <IlluSpaced />
        <div className="idea-text">
          <h3>2. Повторяй с перерывами</h3>
          <p>Лучше повторить пять раз в разные дни, чем пять раз подряд. Мнема сама ставит повторение на момент, когда ты начинаешь забывать.</p>
          <p className="small muted">Попробуй: возвращайся хоть на 5 минут каждый день — это работает лучше, чем один длинный вечер.</p>
          <div className="row gap8 wrap">
            <button className="btn small" onClick={() => go({ name: 'today' })}>
              Что в плане
            </button>
          </div>
        </div>
      </div>
      <div className="card idea">
        <IlluMix />
        <div className="idea-text">
          <h3>3. Смешивай похожее</h3>
          <p>Темы вперемешку учить труднее, зато потом путаешься меньше: мозг учится различать, а не просто узнавать знакомое.</p>
          <p className="small muted">Попробуй: «Пробная контрольная» по нескольким темам (меню темы «⋯» → «Проверить себя»).</p>
        </div>
      </div>
      <div className="card stack gap8 help">
        <h3>Ещё три приёма</h3>
        <ul className="tight">
          <li>
            <strong>Угадай до чтения.</strong> Ответь на вопросы по теме до того, как учишь её: ошибки в начале делают потом запоминание сильнее.
          </li>
          <li>
            <strong>Объясни по-своему.</strong> Если можешь объяснить тему другу простыми словами — ты её понял. Не получается — вернись к конспекту.
          </li>
          <li>
            <strong>Честно оценивай.</strong> «Не помню» — не провал, а сигнал: Мнема повторит карточку раньше.
          </li>
        </ul>
        <p className="small muted">
          Опора — обзор десяти приёмов учёбы (Dunlosky и др., 2013): самое полезное — вспоминать без подсказки и повторять с перерывами.
        </p>
      </div>
    </div>
  );
}


interface HowItem {
  t: string; // что это
  d: ReactNode; // как пользоваться
  desk?: boolean; // только компьютер
}
interface HowGroup {
  id: string;
  icon: string;
  title: string;
  hint: string;
  items: HowItem[];
}

/** «Как пользоваться»: по задачам, а не одним потоком текста. Каждая группа сворачивается, строка — «название и как». */
function howGroups(): HowGroup[] {
  const phone = touchUI();
  return [
    {
      id: 'learn',
      icon: 'play',
      title: 'Учиться каждый день',
      hint: 'Главная кнопка и проверки себя',
      items: [
        { t: '«Учиться»', d: 'Одна кнопка на экране «Сегодня»: Мнема сама собирает план — повторения и немного нового. Выбери, сколько у тебя минут: 5, 10 или 20.' },
        { t: 'Оценка ответа', d: 'Сначала вспомни ответ сам, потом открывай и честно оцени. «Снова» — карточка вернётся скоро, «Легко» — не скоро.' },
        { t: 'Если ошибся', d: 'Отметь причину — «Не помню», «Перепутал» или «Не понял» — и нажми «Снова». Мнема запомнит, что у тебя слабое место.' },
        { t: 'Закрой и перескажи', d: 'Меню темы «⋯» → «Проверить себя»: расскажи тему по памяти, потом сравни с конспектом.' },
        { t: 'Пробная контрольная', d: 'Там же: вопросы по теме или по нескольким темам сразу. «До чтения» — угадать ответы до того, как учишь: так потом запоминается лучше.' },
        { t: 'Контрольная', d: '«＋ Создать» → «Контрольная»: выбери дату и темы — Мнема составит план до этого дня.' }
      ]
    },
    {
      id: 'notes',
      icon: 'edit',
      title: 'Конспект и карточки',
      hint: 'Как записывать и превращать в карточки',
      items: [
        { t: 'Из выделенного — карточка', d: <>В конспекте {selHow('В карточку')}. Одна карточка — один факт.</> },
        { t: '«Из учебника»', d: 'Сфотографируй страницы — Мнема сделает конспект: заголовки, жирное, рисунки и ссылки [стр. N] на фото.' },
        { t: '«Важное»', d: 'Всё, что Мнема нашла в тексте: жирное, определения, даты, имена, рамки «Запомните». Отсюда карточки делаются в один щелчок.' },
        { t: '«Карточки из конспекта»', d: 'Меню темы «⋯»: черновики по группам. Сразу отмечено не больше 12 — учить понемногу легче.' },
        { t: '«+» у вкладок темы', d: 'Словарь, термины, даты, формулы или свой список. Пишешь строку — она сама становится карточкой. Можно вставить много строк сразу.' },
        { t: 'Правила', d: 'Вкладка предмета: грамматика, орфография, законы. Из любой темы они открываются кнопкой «Правила».' },
        { t: 'Задача с числами', d: 'Тип карточки: условие с числами вроде {U=10..220}, ответ формулой {=U/R}. Каждый раз новые числа.' },
        { t: 'Шаблоны карточек', d: 'В окне новой карточки выбери заготовку («Что такое…?», «Дата ↔ событие»…) или сохрани свою.' },
        { t: 'На весь экран', d: phone ? 'Кнопка над конспектом; «Свернуть» — обратно.' : 'Кнопка над конспектом или Ctrl+Shift+F; Esc — обратно.' }
      ]
    },
    {
      id: 'order',
      icon: 'folder',
      title: 'Порядок и вид',
      hint: 'Предметы, папки, темы и оформление',
      items: [
        { t: '«＋ Создать»', d: 'Из одного места создаётся всё: карточка, тема, предмет, папка, контрольная, домашка.' },
        { t: 'Копия', d: '«⋯» у предмета, папки или темы → «Сделать копию»: копируется всё внутри, вместе с конспектами и карточками (прогресс — нет).' },
        { t: 'Править и удалять', d: '«⋯» рядом со строкой в левой панели или правая кнопка: переименовать, перекрасить, удалить.', desk: true },
        { t: 'Свободное место', d: 'Правая кнопка мыши по пустому месту под «Предметы» — новый предмет или папка.', desk: true },
        { t: 'Знания и Профиль', d: '«Знания» — все предметы плитками и поиск. «Профиль» — твой прогресс, настройки, возможности, корзина и справка.' },
        { t: 'Оформление', d: '«Настройки → Оформление»: готовые темы, цвета, шрифт, углы, фон. «Анимации» — какие включить.' },
        { t: '«Возможности»', d: 'Включи то, что нужно, и выключи лишнее — выключенное нигде не видно.' }
      ]
    },
    {
      id: 'devices',
      icon: 'repeat',
      title: 'Телефон и компьютер',
      hint: 'Как перенести всё на другое устройство',
      items: [
        { t: 'По Wi-Fi', d: 'На компьютере «Настройки → Синхронизация по Wi-Fi», на телефоне то же — и наведи камеру на QR-код. Оба устройства — в одной сети. Если Windows спросит про брандмауэр — разреши.' },
        { t: 'Через облако', d: '«Настройки → Облако» (Яндекс Диск, Nextcloud, WebDAV). Можно зашифровать своим паролем — облако увидит только шифр.' },
        { t: 'Ничего не теряется', d: 'Изменения с обоих устройств объединяются, а удалённое удаляется везде.' },
        { t: 'Ответ голосом', d: 'Включи в «Возможностях»: при повторении нажми микрофон и скажи ответ.' }
      ]
    },
    {
      id: 'safe',
      icon: 'trash',
      title: 'Если что-то пропало',
      hint: 'Корзина, автокопии, история',
      items: [
        { t: 'Корзина', d: '«Профиль → Корзина»: удалённое лежит 30 дней, вернуть можно вместе с конспектом и прогрессом.' },
        { t: 'История конспекта', d: 'Меню темы «⋯» → «История конспекта»: вернуть прежний текст.' },
        { t: 'Автокопии', d: '«Профиль → Автокопии»: Мнема сама делает копию каждый день — можно вернуть вчерашнее.' },
        { t: '«Вернуть»', d: 'После удаления и восстановления внизу появляется кнопка «Вернуть» — ею можно отменить.' }
      ]
    }
  ];
}

function Use({ go }: { go: (r: Route) => void }) {
  const groups = howGroups();
  const [open, setOpen] = useState<string[]>(['learn']);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <div className="stack gap12 how">
      <div className="card how-steps stack gap12">
        <h3>Четыре шага</h3>
        <div className="steps-pics">
          {[
            [<IlluTree key="a" />, 'Предмет → тема'],
            [<IlluNote key="b" />, 'Конспект своими словами'],
            [<IlluMake key="c" />, 'Из важного — карточки'],
            [<IlluSpaced key="d" />, 'Каждый день «Учиться»']
          ].map(([pic, cap], i) => (
            <figure key={i}>
              {pic}
              <figcaption>
                <b>{i + 1}.</b> {cap}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      {groups.map((g) => {
        const on = open.includes(g.id);
        const items = g.items.filter((it) => !(it.desk && touchUI()));
        return (
          <section key={g.id} className={'card how-group' + (on ? ' open' : '')}>
            <button type="button" className="how-head" aria-expanded={on} onClick={() => toggle(g.id)}>
              <span className="how-ico">
                <Icon name={g.icon} size={20} />
              </span>
              <span className="how-title">
                <strong>{g.title}</strong>
                <span className="small muted">{g.hint}</span>
              </span>
              <span className="how-count">{items.length}</span>
              <Icon name="chevron" size={18} />
            </button>
            <Collapse open={on}>
              <dl className="how-list">
                {items.map((it) => (
                  <div key={it.t} className="how-row">
                    <dt>{it.t}</dt>
                    <dd>{it.d}</dd>
                  </div>
                ))}
              </dl>
            </Collapse>
          </section>
        );
      })}
      <div className="row gap8 wrap">
        <button className="btn" onClick={() => go({ name: 'help', section: 'learn' })}>
          Как учиться
        </button>
        <button className="btn ghost" onClick={startTutorial}>
          Пройти знакомство
        </button>
      </div>
    </div>
  );
}

export function Help({ section: wanted = 'learn', go }: { section?: Section; go: (r: Route) => void }) {
  // Горячие клавиши — в «Настройки → Горячие клавиши». Как писать моды — в «Настройки → Моды».
  const section: Section = wanted === 'use' ? 'use' : 'learn';
  return (
    <div className="page narrow">
      <div className="row between gap8 wrap">
        <h1 className="display">Справка</h1>
        <button className="btn small" onClick={startTutorial}>
          Пройти знакомство
        </button>
      </div>
      <Segmented
        ariaLabel="Раздел справки"
        value={section}
        onChange={(v) => go({ name: 'help', section: v })}
        options={[
          { value: 'learn', label: 'Как учиться' },
          { value: 'use', label: 'Как пользоваться' }
        ]}
      />

      {section === 'learn' && <Learn go={go} />}

      {section === 'use' && <Use go={go} />}
    </div>
  );
}
