import { useState, type ReactNode } from 'react';
import { Collapse, Icon, Segmented, selHow, touchUI } from '../components/ui';
import { IlluMake, IlluMix, IlluNote, IlluRecall, IlluSpaced, IlluTree } from '../components/Illustrations';
import { byText, createBtn, startTutorial } from '../components/Tutorial';
import { showWhere, type WhereStep } from '../components/ShowMe';
import { DemoModal, type DemoId } from '../components/Demos';
import { getData } from '../store';
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
  where?: () => WhereStep[]; // «Где это?» — перейти и подсветить
  demo?: DemoId; // «Пример» — интерактивная игрушечная версия
}

// ---- «Где это?»: шаги подсветки ----
const anyTopic = () => getData().topics.find((t) => !t.kind)?.id;
const anySubject = () => getData().subjects[0]?.id;
const nav = (desk: string, phone: string): WhereStep['target'] => () => byText('.tab', phone) ?? byText('.sidebar .nav-item', desk);
const inTopic = (target: WhereStep['target'], text: string, tab?: string): WhereStep[] => {
  const id = anyTopic();
  return id ? [{ go: { name: 'topic', id, ...(tab ? { tab } : {}) }, target, text }] : [{ target: createBtn, text: 'Сначала нужна тема: «Создать» → «Новая тема». ' + text }];
};
const topicMenu = (text: string) => inTopic('button[aria-label="Действия с темой"]', 'Это меню темы «⋯». ' + text);
const inSubject = (target: WhereStep['target'], text: string): WhereStep[] => {
  const id = anySubject();
  return id ? [{ go: { name: 'subject', id }, target, text }] : [{ target: createBtn, text: 'Сначала нужен предмет: «Создать» → «Новый предмет». ' + text }];
};
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
        { t: '«Учиться»', d: 'Одна кнопка на экране «Сегодня»: Мнема сама собирает план — повторения и немного нового. Выбери, сколько у тебя минут: 5, 10 или 20.', where: () => [{ go: { name: 'today' }, target: '.hero-btn', text: 'Вот она — «Учиться». Под ней выбираешь, сколько минут: 5, 10 или 20.' }], demo: 'learn' },
        { t: 'Оценка ответа', d: 'Сначала вспомни ответ сам, потом открывай и честно оцени. «Снова» — карточка вернётся скоро, «Легко» — не скоро.', demo: 'learn' },
        { t: 'Если ошибся', d: 'Отметь причину — «Не помню», «Перепутал» или «Не понял» — и нажми «Снова». Мнема запомнит, что у тебя слабое место.', demo: 'mistake' },
        { t: 'Закрой и перескажи', d: 'Меню темы «⋯» → «Проверить себя»: расскажи тему по памяти, потом сравни с конспектом.', where: () => topicMenu('Внутри — «Проверить себя» → «Закрой и перескажи».') },
        { t: 'Пробная контрольная', d: 'Там же: вопросы по теме или по нескольким темам сразу. «До чтения» — угадать ответы до того, как учишь: так потом запоминается лучше.', where: () => topicMenu('Внутри — «Проверить себя» → «Пробная контрольная».') },
        { t: 'Контрольная', d: '«＋ Создать» → «Контрольная»: выбери дату и темы — Мнема составит план до этого дня.', where: () => [{ target: createBtn, text: 'Нажми «Создать» → «Контрольная»: дата и темы.' }] }
      ]
    },
    {
      id: 'notes',
      icon: 'edit',
      title: 'Конспект и карточки',
      hint: 'Как записывать и превращать в карточки',
      items: [
        { t: 'Из выделенного — карточка', d: <>В конспекте {selHow('В карточку')}. Одна карточка — один факт.</>, where: () => inTopic('.ProseMirror', 'Это конспект: выдели фразу — появится «В карточку».'), demo: 'card' },
        { t: '«Из учебника»', d: 'Сфотографируй страницы — Мнема сделает конспект: заголовки, жирное, рисунки и ссылки [стр. N] на фото.', where: () => inTopic('button|Из учебника', 'Кнопка «Из учебника» — над конспектом.') },
        { t: '«Важное»', d: 'Всё, что Мнема нашла в тексте: жирное, определения, даты, имена, рамки «Запомните». Отсюда карточки делаются в один щелчок.', where: () => inTopic('button|Важное', 'Кнопка «Важное» — над конспектом.') },
        { t: '«Карточки из конспекта»', d: 'Меню темы «⋯»: черновики по группам. Сразу отмечено не больше 12 — учить понемногу легче.', where: () => topicMenu('Внутри — «Карточки из конспекта».') },
        { t: '«+» у вкладок темы', d: 'Словарь, термины, даты, формулы или свой список. Пишешь строку — она сама становится карточкой. Можно вставить много строк сразу.', where: () => inTopic('.topic-tabs .add-btn', 'Этот «+» добавляет словарь, термины, даты или свой список.') },
        { t: 'Правила', d: 'Вкладка предмета: грамматика, орфография, законы. Из любой темы они открываются кнопкой «Правила».', where: () => inSubject('.tabs-narrow button|Правила', 'Вкладка «Правила» у предмета (если включены в «Возможностях»).') },
        { t: 'Задача с числами', d: 'Тип карточки: условие с числами вроде {U=10..220}, ответ формулой {=U/R}. Каждый раз новые числа.', where: () => inTopic('button|Вручную', 'На вкладке «Карточки»: «Вручную» → тип «Задача с числами».', 'cards') },
        { t: 'Шаблоны карточек', d: 'В окне новой карточки выбери заготовку («Что такое…?», «Дата ↔ событие»…) или сохрани свою.', where: () => inTopic('button|Вручную', 'На вкладке «Карточки»: «Вручную» — сверху заготовки.', 'cards') },
        { t: 'На весь экран', d: phone ? 'Кнопка над конспектом; «Свернуть» — обратно.' : 'Кнопка над конспектом или Ctrl+Shift+F; Esc — обратно.', where: () => inTopic('button|На весь экран', 'Кнопка над конспектом.') }
      ]
    },
    {
      id: 'order',
      icon: 'folder',
      title: 'Порядок и вид',
      hint: 'Предметы, папки, темы и оформление',
      items: [
        { t: '«＋ Создать»', d: 'Из одного места создаётся всё: карточка, тема, предмет, папка, контрольная, домашка.', where: () => [{ target: createBtn, text: 'Отсюда создаётся всё.' }] },
        { t: 'Копия', d: '«⋯» у предмета, папки или темы → «Сделать копию»: копируется всё внутри, вместе с конспектами и карточками (прогресс — нет).', where: () => inSubject('button[aria-label="Действия с предметом"]', 'В меню «⋯» — «Сделать копию». У темы и папки — так же.'), demo: 'copy' },
        { t: 'Ctrl+C / Ctrl+V', d: 'Выбери в левой панели (Ctrl+щелчок — несколько) или просто открой тему, предмет, папку и нажми Ctrl+C. Ctrl+V вставит копию туда, где ты сейчас: тему — в открытый предмет, предмет — в открытую папку.', desk: true, demo: 'copy' },
        { t: 'Править и удалять', d: '«⋯» рядом со строкой в левой панели или правая кнопка: переименовать, перекрасить, удалить.', desk: true, where: () => [{ target: '.sidebar .tree-row.subject', text: 'Наведи на строку — справа «⋯». Или правая кнопка мыши.' }] },
        { t: 'Свободное место', d: 'Правая кнопка мыши по пустому месту под «Предметы» — новый предмет или папка.', desk: true, where: () => [{ target: '.sidebar .tree', text: 'Правая кнопка мыши по пустому месту здесь — новый предмет или папка.' }] },
        { t: 'Знания и Профиль', d: '«Знания» — все предметы плитками и поиск. «Профиль» — твой прогресс, настройки, возможности, корзина и справка.', where: () => [{ target: nav('Знания', 'Знания'), text: '«Знания» — все предметы плитками.' }, { target: nav('Профиль', 'Профиль'), text: '«Профиль» — прогресс, настройки, корзина, справка.' }] },
        { t: 'Оформление', d: '«Настройки → Оформление»: готовые темы, цвета, шрифт, углы, фон. «Анимации» — какие включить.', where: () => [{ go: { name: 'settings', section: 'look' }, target: '.set-pane, .settings-page', text: 'Здесь темы, цвета, шрифт и фон.' }] },
        { t: '«Возможности»', d: 'Включи то, что нужно, и выключи лишнее — выключенное нигде не видно.', where: () => [{ go: { name: 'features' }, target: '.feat-grid, .settings-page', text: 'Включай нужное, выключай лишнее.' }] }
      ]
    },
    {
      id: 'devices',
      icon: 'repeat',
      title: 'Телефон и компьютер',
      hint: 'Как перенести всё на другое устройство',
      items: [
        { t: 'По Wi-Fi', d: 'На компьютере «Настройки → Синхронизация по Wi-Fi», на телефоне то же — и наведи камеру на QR-код. Оба устройства — в одной сети. Если Windows спросит про брандмауэр — разреши.', where: () => [{ go: { name: 'settings', section: 'data' }, target: '.srow|Синхронизация по Wi-Fi', text: '«Настройки → Данные → Синхронизация по Wi-Fi».' }], demo: 'wifi' },
        { t: 'Через облако', d: '«Настройки → Облако» (Яндекс Диск, Nextcloud, WebDAV). Можно зашифровать своим паролем — облако увидит только шифр.', where: () => [{ go: { name: 'settings', section: 'data' }, target: '.srow|Облако', text: '«Настройки → Данные → Облако».' }], demo: 'cloud' },
        { t: 'Ничего не теряется', d: 'Изменения с обоих устройств объединяются, а удалённое удаляется везде.' },
        { t: 'Ответ голосом', d: 'Включи в «Возможностях»: при повторении нажми микрофон и скажи ответ.', where: () => [{ go: { name: 'features' }, target: '.feat-tile|Ответ голосом', text: 'Включи «Ответ голосом» — в повторении появится микрофон.' }] }
      ]
    },
    {
      id: 'safe',
      icon: 'trash',
      title: 'Если что-то пропало',
      hint: 'Корзина, автокопии, история',
      items: [
        { t: 'Корзина', d: '«Профиль → Корзина»: удалённое лежит 30 дней, вернуть можно вместе с конспектом и прогрессом.', where: () => [{ go: { name: 'trash' }, target: '.trash-page h1', text: 'Удалённое лежит здесь 30 дней — «Вернуть» в один щелчок.' }], demo: 'trash' },
        { t: 'История конспекта', d: 'Меню темы «⋯» → «История конспекта»: вернуть прежний текст.', where: () => topicMenu('Внутри — «История конспекта» (появляется, когда текст уже правили).') },
        { t: 'Автокопии', d: '«Профиль → Автокопии»: Мнема сама делает копию каждый день — можно вернуть вчерашнее.', where: () => [{ go: { name: 'profile' }, target: '.prof-links .create-item|Автокопии', text: 'Нажми — откроются копии по дням.' }] },
        { t: '«Вернуть»', d: 'После удаления и восстановления внизу появляется кнопка «Вернуть» — ею можно отменить.', demo: 'trash' }
      ]
    }
  ];
}

function Use({ go }: { go: (r: Route) => void }) {
  const groups = howGroups();
  const [open, setOpen] = useState<string[]>(['learn']);
  const [demo, setDemo] = useState<DemoId | null>(null);
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
                    <dd>
                      {it.d}
                      {(it.where || it.demo) && (
                        <span className="how-acts">
                          {it.where && (
                            <button type="button" className="chip-btn small" onClick={() => showWhere(it.where!())}>
                              <Icon name="search" size={14} /> Где это?
                            </button>
                          )}
                          {it.demo && (
                            <button type="button" className="chip-btn small" onClick={() => setDemo(it.demo!)}>
                              <Icon name="play" size={14} /> Пример
                            </button>
                          )}
                        </span>
                      )}
                    </dd>
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
      {demo && <DemoModal id={demo} onClose={() => setDemo(null)} />}
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
