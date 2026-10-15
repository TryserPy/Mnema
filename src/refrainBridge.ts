// Refrain ИИ в окне приложения: одни и те же действия на Windows/Linux (preload → главный процесс) и Android (клиент живёт в окне).
// Здесь нет токенов и ключа устройства: наружу отдаются только результаты (маска почты, лимит, устройства, номер обращения).
import type { BugReport, DeviceInfo, Me, Quota } from '../shared/refrain/api.mjs';
import type { RefrainClient, RefrainResult, RefrainStatus } from '../shared/refrainClient.mjs';

export interface RefrainApi {
  status(): Promise<RefrainStatus>;
  loginStart(email: string): Promise<RefrainResult>;
  loginVerify(p: { email: string; code: string; invite?: string; replaceDevice?: string }): Promise<RefrainResult<{ emailMasked: string; quota: Quota }>>;
  me(): Promise<RefrainResult<Omit<Me, 'ok'>>>;
  invite(code: string): Promise<RefrainResult<{ quota: Quota }>>;
  unbind(id: string): Promise<RefrainResult>;
  deleteAccount(): Promise<RefrainResult>;
  logout(): Promise<RefrainResult>;
  bug(report: Omit<BugReport, 'pow'>): Promise<RefrainResult<{ id: number }>>;
  /** Снимок окна (JPEG base64) для «Сообщить о проблеме»; null — здесь так нельзя. */
  screenshot(): Promise<string | null>;
}

export type { DeviceInfo, Quota };

/** Android: действия клиента из окна. deviceName — как устройство подписано в списке «Устройства». */
export function refrainBridge(c: RefrainClient, o: { deviceName: string }): { refrain: RefrainApi } {
  return {
    refrain: {
      status: () => c.status(),
      loginStart: (email) => c.loginStart(email),
      loginVerify: (p) => c.loginVerify({ email: p.email, code: p.code, invite: p.invite, replaceDevice: p.replaceDevice, deviceName: o.deviceName }),
      me: () => c.me(),
      invite: (code) => c.invite(code),
      unbind: (id) => c.unbind(id),
      deleteAccount: () => c.deleteAccount(),
      logout: () => c.logout(),
      bug: (r) => c.bug(r),
      screenshot: async () => null
    }
  };
}

/** Refrain ИИ на этой платформе; null — веб-версия (там его нет). */
export function refrainApi(): RefrainApi | null {
  const api = window.mnemaApi as unknown as { refrain?: RefrainApi } | undefined;
  return api?.refrain ?? null;
}

/** Имя телефона для списка устройств: «Android · Pixel 7» из строки браузера. */
export function androidDeviceName(ua: string): string {
  const m = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(ua);
  const model = m?.[1]?.trim();
  return model && model !== 'K' ? `Android · ${model}`.slice(0, 60) : 'Android';
}
