// «На сегодня бесплатные страницы закончились» и «Refrain ИИ в закрытом тесте»: что делать дальше — без интернета, свой ключ или без ИИ.
import type { ErrorCode, Quota } from '../../shared/refrain/api.mjs';
import { refrainMessage } from '../refrain';
import { InviteForm, QuotaMeter } from './RefrainSettings';
import { Modal } from './ui';

export type LimitCode = Extract<ErrorCode, 'limit_day' | 'limit_month' | 'access_closed'>;

export function LimitScreen({ code, quota, onClose, onOffline, onOwnKey }: { code: LimitCode; quota?: Quota; onClose: () => void; onOffline: () => void; onOwnKey: () => void }) {
  if (code === 'access_closed')
    return (
      <Modal title="Refrain ИИ сейчас в закрытом тесте" onClose={onClose}>
        <div className="stack gap12">
          <InviteForm onDone={onClose} />
          <Choices onClose={onClose} onOffline={onOffline} onOwnKey={onOwnKey} />
        </div>
      </Modal>
    );
  return (
    <Modal title={code === 'limit_day' ? 'На сегодня бесплатные страницы закончились' : 'Бесплатные страницы на этот месяц закончились'} onClose={onClose}>
      <div className="stack gap12" data-part="limit">
        <p className="small">{refrainMessage(code)}</p>
        {quota && <QuotaMeter quota={quota} />}
        <Choices onClose={onClose} onOffline={onOffline} onOwnKey={onOwnKey} />
      </div>
    </Modal>
  );
}

function Choices({ onClose, onOffline, onOwnKey }: { onClose: () => void; onOffline: () => void; onOwnKey: () => void }) {
  return (
    <div className="stack gap8 rf-choices">
      <button className="btn" onClick={onOffline}>
        <strong>Без интернета</strong>
        <span className="small muted">Модель на компьютере (LM Studio)</span>
      </button>
      <button className="btn" onClick={onOwnKey}>
        <strong>Свой ключ</strong>
        <span className="small muted">Claude, Gemini или другой ИИ по API</span>
      </button>
      <button className="btn ghost" onClick={onClose}>
        <strong>Без ИИ</strong>
        <span className="small muted">Сделаю сам, без помощника</span>
      </button>
    </div>
  );
}
