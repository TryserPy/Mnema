// Анимации: общий уровень и какие именно виды включены. Показывается в «Оформлении» и во вкладке «Анимации» редактора стиля.
import { updateSettings, useData } from '../store';
import type { MotionKind, MotionLevel } from '../types';
import { Group, SRow } from './SettingsKit';
import { Segmented, Switch } from './ui';

const KIND_LABELS: [MotionKind, string, string][] = [
  ['screens', 'Переходы между экранами', 'Экран плавно появляется'],
  ['windows', 'Окна и меню', 'Появляются и исчезают плавно'],
  ['expand', 'Раскрытие блоков', 'Списки и разделы раскрываются плавно'],
  ['text', 'Смена текста и чисел', 'Числа докручиваются'],
  ['review', 'Карточки при повторении', 'Карточка выезжает, ответ открывается'],
  ['hover', 'Мелкие эффекты', 'Кнопки чуть приподнимаются, строки подсвечиваются'],
  ['lists', 'Списки и плитки', 'Появляются по очереди, а не разом'],
  ['press', 'Нажатия', 'Кнопки и вкладки слегка «вдавливаются»'],
  ['guide', 'Картинки в справке', 'Рисунки в справке и знакомстве оживают']
];

/** Два блока: общий уровень анимаций и переключатели по видам. */
export function MotionGroups() {
  const data = useData();
  const s = data.settings;
  const offNow: MotionKind[] = s.motion === 'off' ? KIND_LABELS.map((k) => k[0]) : s.motion === 'essential' ? ['screens', 'text', 'hover', 'lists', 'press', 'guide'] : s.motion === 'custom' ? s.motionOff : [];
  const toggle = (k: MotionKind, on: boolean) => {
    const next = on ? offNow.filter((x) => x !== k) : [...offNow, k];
    const level: MotionLevel = next.length === 0 ? 'all' : next.length === KIND_LABELS.length ? 'off' : 'custom';
    updateSettings({ motion: level, motionOff: next });
  };
  return (
    <>
      <Group>
        <div className="srow stack-row" data-set="motion">
          <div className="ctl-seg full">
            <Segmented
              ariaLabel="Анимации"
              value={s.motion}
              onChange={(v) => updateSettings({ motion: v })}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'essential', label: 'Важные' },
                { value: 'off', label: 'Нет' },
                { value: 'custom', label: 'Свои' }
              ]}
            />
          </div>
        </div>
      </Group>
      <Group title="Какие именно">
        {KIND_LABELS.map(([k, label, hint]) => (
          <SRow key={k} label={label} hint={hint} id={'motion-' + k}>
            <Switch label={label} checked={!offNow.includes(k)} onChange={(v) => toggle(k, v)} />
          </SRow>
        ))}
      </Group>
    </>
  );
}
