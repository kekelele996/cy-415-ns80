import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  /** 物主改选时另选的申请人物品；申请人确认前仅作为候选项，原 from_item_id 仍为约定物品 */
  proposed_from_item_id?: string;
  status: ExchangeStatus;
  message: string;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<Exchange, 'id' | 'status' | 'created_at' | 'updated_at'> & {
  proposed_from_item_id?: string;
  status?: ExchangeStatus;
};
