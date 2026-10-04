// «Обновления» для веб-версии: установить как приложение и проверить, что версия свежая.
// Сами обновления приносит сайт: service worker скачивает новую версию, а плашка «Обновить» (platform/web.ts) её включает.
import { useEffect, useState } from 'react';
import { promptInstall, useInstallState } from '../platform/webInstall';
import { APP_VERSION, UPDATE_REPO } from '../update';
import { Group, SRow } from './SettingsKit';
import { Icon } from './ui';

export function WebGroup() {
  const state = useInstallState();
  const [check, setCheck] = useState<'idle' | 'busy' | 'done'>('idle');
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const checkNow = async () => {
    setCheck('busy');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* нет сети — скажем то же самое: плашка появится, если обновление есть */
    }
    setCheck('done');
  };

  return (
    <Group title="Установка и обновления" id="update">
      <SRow
        label="Установить как приложение"
        hint={
          state === 'installed'
            ? 'Мнема уже открыта как приложение ✓'
            : state === 'ios'
              ? 'Нажми «Поделиться» в Safari → «На экран „Домой“». Так Мнема откроется без адресной строки, работает без интернета, а Safari не очищает её данные.'
              : state === 'prompt'
                ? 'Свой значок, окно без адресной строки и работа без интернета'
                : 'В меню браузера выбери «Установить приложение» или «Добавить на главный экран»'
        }
      >
        {state === 'prompt' && (
          <button className="btn small primary" onClick={() => void promptInstall()}>
            <Icon name="plus" size={16} /> Установить
          </button>
        )}
      </SRow>
      <SRow label="Версия" hint="Новая версия подтягивается сама при открытии; когда она готова, внизу появится кнопка «Обновить»">
        <span className="small muted">{APP_VERSION}</span>
        <button className="btn small" disabled={check === 'busy'} onClick={() => void checkNow()}>
          <Icon name="sync" size={16} /> {check === 'busy' ? 'Проверяю…' : check === 'done' ? 'Проверено ✓' : 'Проверить'}
        </button>
      </SRow>
      <SRow
        label="Данные в браузере"
        hint={
          persisted
            ? 'Браузер обещал не стирать данные Мнемы сам. Копию всё равно стоит иногда сохранять (раздел «Данные»).'
            : 'Всё лежит в этом браузере. Если очистить данные сайтов или сменить браузер, предметы пропадут, — сохраняй копию (раздел «Данные»).'
        }
      />
      <div className="srow stack-row">
        <span className="small muted">
          Для работы без браузера есть приложения для Windows и Android:{' '}
          <a href={`https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`} target="_blank" rel="noreferrer">
            скачать
          </a>
        </span>
      </div>
    </Group>
  );
}
