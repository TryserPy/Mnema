// Справка для тех, кто пишет моды: пример и всё, что умеет объект app.

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

/** Как писать моды — окно из «Настроек → Моды» (раньше было вкладкой справки). */
export function ModsGuide() {
  return (
    <div className="stack gap12">
      <div className="card stack gap8 help">
        <h3>Что такое мод</h3>
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
