import { useState } from 'react';
import { renderTex } from '../components/Markdown';
import { Segmented } from '../components/ui';
import { FORMULA_GROUPS } from '../formulaExamples';
import { KEY_DEFS, keyFor, prettyCombo } from '../keys';
import { useData } from '../store';
import type { Route } from '../types';

type Section = 'start' | 'formulas' | 'keys' | 'mods';

export function Help({ section = 'start', go }: { section?: Section; go: (r: Route) => void }) {
  const [copied, setCopied] = useState('');
  const data = useData();
  return (
    <div className="page narrow">
      <h1 className="display">Справка</h1>
      <Segmented
        ariaLabel="Раздел справки"
        value={section}
        onChange={(v) => go({ name: 'help', section: v })}
        options={[
          { value: 'start', label: 'Как учиться' },
          { value: 'formulas', label: 'Формулы' },
          { value: 'keys', label: 'Клавиши' },
          { value: 'mods', label: 'Моды' }
        ]}
      />

      {section === 'start' && (
        <div className="card stack gap12 help">
          <h3>Четыре шага</h3>
          <ol className="steps">
            <li>
              <strong>Предмет → тема.</strong> Тема — это параграф или раздел учебника.
            </li>
            <li>
              <strong>Конспект своими словами.</strong> Коротко: главное, определения, формулы, схемы. Жирным выдели ключевые понятия.
            </li>
            <li>
              <strong>Карточки.</strong> Выдели фразу в конспекте, нажми правую кнопку мыши и выбери «В карточку» (на телефоне панель появится сама). Одна карточка — один факт.
            </li>
            <li>
              <strong>Каждый день — «Начать».</strong> Сначала вспомни ответ сам, потом открывай. Честно оценивай, помнил ли.
            </li>
          </ol>
          <h3>Почему это работает</h3>
          <p>
            Два самых полезных приёма учёбы по обзору 10 методов (Dunlosky и др., 2013) — <strong>вспоминать без подсказки</strong> и <strong>повторять с перерывами</strong>. Перечитывание и маркер помогают мало. Мнема сама решает, когда повторить карточку: чуть раньше, чем ты её забудешь.
          </p>
          <h3>Полезные кнопки</h3>
          <ul className="tight">
            <li>«Закрой и перескажи» (меню темы) — пересказ по памяти, потом сравнение с конспектом.</li>
            <li>«Пробная контрольная» — проверить себя перед контрольной. «Проверь себя до чтения» — угадать ответы до того, как учишь тему: так потом запоминается лучше.</li>
            <li>«Из учебника» (в конспекте) — сфотографируй страницы, и Мнема сделает конспект: заголовки, жирное, рисунки и ссылки [стр. N] на фото страниц.</li>
            <li>«Важное» — всё, что Мнема нашла: жирное, определения, даты, имена, формулы, рамки «Запомните». Отсюда — карточки в один щелчок.</li>
            <li>«Задача с числами» (тип карточки) — условие с изменяемыми числами вроде {'{U=10..220}'}, ответ формулой {'{=U/R}'}. Каждый раз новые числа.</li>
            <li>«Лента времени» (в предмете) — все даты из конспектов по порядку.</li>
            <li>«+» рядом с вкладками темы — словарь, термины, даты, формулы или свой список. Пишешь строку — она сама становится карточкой. Можно вставить сразу много строк: «слово — перевод» по строке на запись.</li>
            <li>«Правила» (вкладка у предмета) — общие правила: грамматика, орфография, законы. Из любой темы они открываются кнопкой «Правила».</li>
            <li>«На весь экран» (в конспекте, Ctrl+Shift+F) — конспект занимает всё окно, Esc — обратно.</li>
            <li>Шаблоны карточек: в окне новой карточки выбери заготовку («Что такое…?», «Дата ↔ событие», «Формула»…) или сохрани свою.</li>
            <li>«Настройки → Оформление»: готовые темы, свои цвета, шрифт, углы и фон (например, тетрадь в клетку). «Анимации» — все, только важные, выключить или выбрать, какие.</li>
            <li>«Статистика»: итоги недели, достижения за серию дней и сад знаний, где каждая тема — растение.</li>
            <li>Экспорт в Anki и печать карточек — в «Настройках → Данные» и в меню предмета.</li>
            <li>Предмет можно переименовать, перекрасить или удалить: «⋯» рядом с предметом в левой панели или правый щелчок. Удалённое можно вернуть кнопкой «Вернуть».</li>
            <li>«Возможности» (слева внизу) — включить то, что нужно, и выключить лишнее.</li>
          </ul>
          <h3>Телефон и компьютер</h3>
          <ul className="tight">
            <li>
              <strong>По Wi-Fi:</strong> на компьютере «Настройки → Синхронизация по Wi-Fi», на телефоне то же самое — и наведи камеру на QR-код. Оба устройства должны быть в одной сети. Если Windows спросит про брандмауэр — разреши доступ.
            </li>
            <li>
              <strong>Через облако:</strong> «Настройки → Облако» (Яндекс Диск, Nextcloud, любой WebDAV). Для Яндекс Диска нужен пароль приложения. Можно зашифровать своим паролем — тогда облако видит только шифр.
            </li>
            <li>Ничего не теряется: изменения с обоих устройств объединяются, а удалённое удаляется везде.</li>
            <li>
              <strong>Ответ голосом</strong> (в «Возможностях»): при повторении нажми микрофон и скажи ответ. На телефоне распознаёт сам телефон, на компьютере — ИИ-помощник.
            </li>
          </ul>
        </div>
      )}

      {section === 'formulas' && (
        <div className="stack gap12">
          <div className="card stack gap8 help">
            <h3>Как вставить формулу</h3>
            <ul className="tight">
              <li>
                <strong>Проще всего:</strong> в конспекте «Вставить → Формула», в карточке «+ Формула». Там кнопки для дробей, степеней, корней и экранная клавиатура.
              </li>
              <li>
                <strong>Прямо в тексте:</strong> напиши формулу между знаками доллара: <code>$E = mc^2$</code>. Как только поставишь второй знак $, она станет красивой.
              </li>
              <li>
                <strong>Отдельной строкой</strong> (крупно, по центру): <code>$$ … $$</code> на отдельной строке.
              </li>
              <li>Нажми на формулу в конспекте, чтобы её изменить.</li>
            </ul>
            <p className="small muted">Внутри — язык LaTeX, как в учебниках и научных статьях. Ниже — готовые примеры: копируй и меняй.</p>
          </div>
          {FORMULA_GROUPS.map((g) => (
            <div key={g.title} className="card stack gap8">
              <h3>{g.title}</h3>
              <div className="formula-table">
                {g.items.map((it) => (
                  <div key={it.name} className="formula-row">
                    <span className="small muted f-name">{it.name}</span>
                    <span className="f-render" dangerouslySetInnerHTML={{ __html: renderTex(it.tex, false) }} />
                    <code className="f-code">${it.tex}$</code>
                    <button
                      className="btn small ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(`$${it.tex}$`);
                        setCopied(it.name);
                        setTimeout(() => setCopied(''), 1200);
                      }}
                    >
                      {copied === it.name ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'keys' && (
        <div className="card help">
          <table className="keys">
            <tbody>
              {KEY_DEFS.filter((d) => keyFor(data.settings, d.id)).map((d) => (
                <tr key={d.id}>
                  <td>
                    {prettyCombo(keyFor(data.settings, d.id)).map((p, i) => (
                      <span key={i}>
                        {i > 0 && ' + '}
                        <span className="kbd">{p}</span>
                      </span>
                    ))}
                  </td>
                  <td>
                    {d.label}
                    {d.group !== 'Везде' && <span className="muted small"> · {d.group.toLowerCase()}</span>}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <span className="kbd">Ctrl</span> + <span className="kbd">B</span> / <span className="kbd">I</span>
                </td>
                <td>Жирный / курсив в конспекте</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Ctrl</span> + <span className="kbd">Z</span>
                </td>
                <td>Отменить (в конспекте и в рисунке)</td>
              </tr>
              <tr>
                <td>
                  <code>## </code> в начале строки
                </td>
                <td>Заголовок; <code>- </code> — список</td>
              </tr>
            </tbody>
          </table>
          <button className="btn small" onClick={() => go({ name: 'settings' })}>
            Изменить клавиши в настройках
          </button>
        </div>
      )}
      {section === 'mods' && <ModsHelp />}
    </div>
  );
}

const API_ROWS: [string, string][] = [
  ['app.commands.add({ id, name, hotkey?, run })', 'Команда в поиске (Ctrl+P). hotkey — например «Ctrl+Shift+O».'],
  ['app.ui.addView({ id, title, icon, render(el) })', 'Свой экран с кнопкой в левой панели. render рисует в el и может вернуть функцию очистки.'],
  ['app.ui.openView(id)', 'Открыть свой экран.'],
  ['app.ui.addSidebarButton({ id, icon, title, onClick })', 'Кнопка в левой панели.'],
  ['app.ui.addTopicAction({ id, title, run(topic) })', 'Пункт в меню «⋯» темы. topic: id, name, note, subjectId.'],
  ['app.ui.addSettingsTab(render(el))', 'Настройки мода — открываются в «Настройках → Моды».'],
  ['app.ui.addStyle(css)', 'Свои стили (убираются, когда мод выключен).'],
  ['app.ui.toast(text) · app.ui.modal(title, render(el, close))', 'Сообщение внизу и своё окно.'],
  ['app.ui.renderMarkdown(el, md) · app.ui.go(route)', 'Нарисовать Markdown с формулами; перейти на экран.'],
  ['app.markdown.addPostProcessor((el, { source }) => …)', 'Обработать конспект или карточку после отрисовки (при повторении, в правилах).'],
  ["app.events.on('review' | 'dataChanged' | 'route', fn)", 'review: { cardId, topicId, rating 1–4 }. Отписка — сама, при выключении мода.'],
  ['app.data.get() · subjects() · topics() · cards()', 'Копия данных — читать можно всё.'],
  ['app.data.addTopic · updateTopic · addCard · updateCard · addHomework', 'Изменить данные (синхронизируются и попадают в копии).'],
  ['app.storage.get(key) · app.storage.set(key, value)', 'Хранилище мода (переживает перезапуск и синхронизируется).'],
  ['app.ai.ask(text) · app.http(url, init)', 'Спросить ИИ-помощника; запрос в интернет в обход ограничений окна.']
];

function ModsHelp() {
  return (
    <div className="stack gap12">
      <div className="card stack gap8 help">
        <h3>Моды</h3>
        <p>
          Мод — это JavaScript-файл. Он получает объект <code>app</code> и может добавлять экраны, команды, кнопки, пункты меню, реагировать на ответы и работать с данными. Включаются в «Возможностях», управляются в «Настройках → Моды». Пока включён безопасный режим, моды не запускаются.
        </p>
        <p className="small muted">Только внешний вид меняют «Стили» (CSS) — они в «Настройках → Стили» и работают без модов.</p>
        <pre className="code-sample">{`// @id hello
// @name Привет
// @version 1.0
// @description Первый мод

export default {
  onload(app) {
    app.commands.add({
      id: 'hi',
      name: 'Сказать привет',
      run: () => app.ui.toast('Привет! Тем: ' + app.data.topics().length)
    });
  },
  onunload() {}
};`}</pre>
      </div>
      <div className="card stack gap8 help">
        <h3>Что умеет app</h3>
        <div className="api-table">
          {API_ROWS.map(([a, b]) => (
            <div key={a} className="api-row">
              <code>{a}</code>
              <span className="small">{b}</span>
            </div>
          ))}
        </div>
        <p className="small muted">Мод работает внутри приложения и видит все твои данные. Ставь моды только от тех, кому доверяешь. Если что-то сломалось — включи безопасный режим, и все моды остановятся.</p>
      </div>
    </div>
  );
}
