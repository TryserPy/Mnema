// Моды с кодом — как плагины Obsidian. Мод — это JS-модуль:
//   export default { onload(app) { … }, onunload() { … } }
// Через `app` мод добавляет команды, кнопки в левую панель, свои экраны, действия с темой,
// обработку конспектов, слушает события и работает с данными. Мод может всё, что может Мнема,
// поэтому включать стоит только моды от тех, кому доверяешь (как в Obsidian).
import { useSyncExternalStore } from 'react';
import { renderMarkdown } from '../components/Markdown';
import { toast } from '../components/ui';
import { addCard, addHomework, addTopic, getData, updateCard, updateSettings, updateTopic } from '../store';
import type { AppData, Card, PluginRec, Route } from '../types';
import { emit, on } from './bus';

export interface PluginCommand {
  id: string;
  name: string;
  plugin: string;
  hotkey?: string;
  run: () => void;
}
export interface PluginButton {
  id: string;
  plugin: string;
  icon: string;
  title: string;
  onClick: () => void;
}
export interface PluginView {
  id: string; // `${plugin}:${view}`
  plugin: string;
  title: string;
  icon: string;
  render: (el: HTMLElement) => void | (() => void);
}
export interface TopicAction {
  id: string;
  plugin: string;
  title: string;
  run: (topic: { id: string; name: string; note: string; subjectId: string }) => void;
}
type PostProcessor = (el: HTMLElement, ctx: { source: string }) => void;

interface Registry {
  commands: PluginCommand[];
  buttons: PluginButton[];
  views: PluginView[];
  topicActions: TopicAction[];
  settingsTabs: Map<string, (el: HTMLElement) => void | (() => void)>;
  postProcessors: { plugin: string; fn: PostProcessor }[];
  errors: Map<string, string>;
  loaded: Set<string>;
}

const reg: Registry = { commands: [], buttons: [], views: [], topicActions: [], settingsTabs: new Map(), postProcessors: [], errors: new Map(), loaded: new Set() };
const cleanups = new Map<string, (() => void)[]>();
const instances = new Map<string, { onunload?: () => void }>();
let version = 0;
const subs = new Set<() => void>();
function changed() {
  version++;
  subs.forEach((f) => f());
}
/** Перерисовать экран, когда моды что-то добавили. */
export function usePlugins(): Registry {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version
  );
  return reg;
}
export const registry = reg;

let navigate: (r: Route) => void = () => undefined;
export function setNavigator(fn: (r: Route) => void) {
  navigate = fn;
}

/** Запустить обработку Markdown модами (вызывается компонентом Markdown). */
export function runPostProcessors(el: HTMLElement, source: string) {
  for (const p of reg.postProcessors) {
    try {
      p.fn(el, { source });
    } catch (e) {
      console.error('Мод', p.plugin, e);
    }
  }
}

function safeData(d: AppData) {
  // Моду отдаём копию, чтобы он не испортил данные случайно — менять данные можно только методами app.data.*
  return structuredClone(d);
}

function makeApi(p: PluginRec) {
  const own = (fn: () => void) => cleanups.get(p.id)!.push(fn);
  const openModal = (title: string, render: (el: HTMLElement, close: () => void) => void | (() => void)) => {
    const back = document.createElement('div');
    back.className = 'modal-back plugin-modal';
    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.style.width = '560px';
    const head = document.createElement('div');
    head.className = 'modal-head';
    const h = document.createElement('h2');
    h.textContent = title;
    const x = document.createElement('button');
    x.className = 'icon-btn';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Закрыть');
    head.append(h, x);
    const body = document.createElement('div');
    box.append(head, body);
    back.append(box);
    document.body.append(back);
    let cleanup: void | (() => void);
    const close = () => {
      try {
        cleanup?.();
      } catch {
        /* мод */
      }
      back.remove();
    };
    x.onclick = close;
    back.onmousedown = (e) => e.target === back && close();
    cleanup = render(body, close);
    own(close);
    return close;
  };
  return {
    id: p.id,
    version: '1.5',
    platform: window.mnemaApi?.platform ?? 'browser',
    commands: {
      add(c: { id: string; name: string; hotkey?: string; run: () => void }) {
        reg.commands.push({ ...c, id: p.id + ':' + c.id, plugin: p.id });
        changed();
      }
    },
    ui: {
      addSidebarButton(b: { id: string; icon: string; title: string; onClick: () => void }) {
        reg.buttons.push({ ...b, id: p.id + ':' + b.id, plugin: p.id });
        changed();
      },
      addView(v: { id: string; title: string; icon?: string; render: (el: HTMLElement) => void | (() => void) }) {
        const id = p.id + ':' + v.id;
        reg.views.push({ id, plugin: p.id, title: v.title, icon: v.icon ?? '🧩', render: v.render });
        changed();
      },
      openView(viewId: string) {
        navigate({ name: 'plugin', id: p.id + ':' + viewId });
      },
      addTopicAction(a: { id: string; title: string; run: TopicAction['run'] }) {
        reg.topicActions.push({ ...a, id: p.id + ':' + a.id, plugin: p.id });
        changed();
      },
      addSettingsTab(render: (el: HTMLElement) => void | (() => void)) {
        reg.settingsTabs.set(p.id, render);
        changed();
      },
      addStyle(css: string) {
        const el = document.createElement('style');
        el.dataset.plugin = p.id;
        el.textContent = css;
        document.head.append(el);
        own(() => el.remove());
      },
      toast: (text: string) => toast(String(text).slice(0, 200)),
      modal: openModal,
      go: (r: Route) => navigate(r),
      renderMarkdown(el: HTMLElement, md: string) {
        el.classList.add('md');
        el.innerHTML = renderMarkdown(md);
      }
    },
    markdown: {
      addPostProcessor(fn: PostProcessor) {
        const item = { plugin: p.id, fn };
        reg.postProcessors.push(item);
        own(() => {
          reg.postProcessors = reg.postProcessors.filter((x) => x !== item);
        });
      }
    },
    events: {
      on(name: 'review' | 'dataChanged' | 'route', fn: (payload: unknown) => void) {
        own(on(name, fn));
      }
    },
    data: {
      get: () => safeData(getData()),
      subjects: () => safeData(getData()).subjects,
      topics: () => safeData(getData()).topics,
      cards: () => safeData(getData()).cards,
      addTopic: (subjectId: string, name: string) => addTopic(subjectId, name).id,
      updateTopic: (id: string, patch: { name?: string; note?: string }) => updateTopic(id, { ...(patch.name !== undefined ? { name: String(patch.name) } : {}), ...(patch.note !== undefined ? { note: String(patch.note) } : {}) }),
      addCard: (c: { topicId: string; front: string; back: string; type?: Card['type'] }) => addCard({ topicId: c.topicId, type: c.type ?? 'basic', front: String(c.front), back: String(c.back) }).id,
      updateCard: (id: string, patch: { front?: string; back?: string }) => updateCard(id, patch),
      addHomework: (h: { text: string; subjectId?: string; due?: string }) => addHomework({ text: String(h.text), subjectId: h.subjectId, due: h.due }).id
    },
    storage: {
      get(key: string) {
        return getData().settings.pluginData[p.id]?.[key];
      },
      set(key: string, value: unknown) {
        const all = getData().settings.pluginData;
        updateSettings({ pluginData: { ...all, [p.id]: { ...(all[p.id] ?? {}), [key]: JSON.parse(JSON.stringify(value ?? null)) } } });
      }
    },
    ai: {
      async ask(text: string) {
        const r = await window.mnemaApi?.aiAsk?.({ text: String(text), maxTokens: 800 });
        if (!r) throw new Error('ИИ-помощник не настроен');
        if (!r.ok) throw new Error(r.error);
        return r.text;
      }
    },
    http: async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
      if (!window.mnemaApi?.http) throw new Error('Сеть для модов работает в приложении (Windows или Android)');
      return window.mnemaApi.http({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body, timeout: 30000 });
    }
  };
}
export type MnemaApp = ReturnType<typeof makeApi>;

/** Разобрать шапку мода: // @name …, // @id …, // @version …, // @author …, // @description … */
export function parseHeader(code: string): { id?: string; name?: string; version?: string; author?: string; description?: string; icon?: string } {
  const out: Record<string, string> = {};
  for (const m of code.slice(0, 3000).matchAll(/^\s*\/\/\s*@(\w+)\s+(.+)$/gm)) out[m[1]] = m[2].trim();
  return out;
}

export async function loadPlugin(p: PluginRec) {
  if (reg.loaded.has(p.id)) return;
  reg.errors.delete(p.id);
  cleanups.set(p.id, []);
  const url = URL.createObjectURL(new Blob([p.code], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    const impl = mod.default ?? mod;
    const inst = typeof impl === 'function' ? new impl() : impl;
    if (!inst || typeof inst.onload !== 'function') throw new Error('В моде нет onload(app). Нужен export default { onload(app) { … } }');
    instances.set(p.id, inst);
    reg.loaded.add(p.id);
    await inst.onload(makeApi(p));
  } catch (e) {
    reg.errors.set(p.id, (e as Error).message || String(e));
    unloadPlugin(p.id);
  } finally {
    URL.revokeObjectURL(url);
    changed();
  }
}

export function unloadPlugin(id: string) {
  try {
    instances.get(id)?.onunload?.();
  } catch (e) {
    console.error(e);
  }
  instances.delete(id);
  for (const fn of cleanups.get(id) ?? []) {
    try {
      fn();
    } catch {
      /* мод */
    }
  }
  cleanups.delete(id);
  reg.commands = reg.commands.filter((c) => c.plugin !== id);
  reg.buttons = reg.buttons.filter((c) => c.plugin !== id);
  reg.views = reg.views.filter((c) => c.plugin !== id);
  reg.topicActions = reg.topicActions.filter((c) => c.plugin !== id);
  reg.settingsTabs.delete(id);
  reg.postProcessors = reg.postProcessors.filter((c) => c.plugin !== id);
  reg.loaded.delete(id);
  changed();
}

/** Привести запущенные моды в соответствие с настройками. */
export async function syncPlugins() {
  const s = getData().settings;
  const want = new Set(!s.pluginsSafe && s.features.mods ? s.plugins.filter((p) => p.enabled).map((p) => p.id) : []);
  for (const id of [...reg.loaded]) if (!want.has(id)) unloadPlugin(id);
  for (const p of s.plugins) if (want.has(p.id) && !reg.loaded.has(p.id)) await loadPlugin(p);
}

/** Перезапустить мод (после правки кода). */
export async function reloadPlugin(id: string) {
  unloadPlugin(id);
  await syncPlugins();
}

export { emit };
