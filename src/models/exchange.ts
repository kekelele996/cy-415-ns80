import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  /**
   * 物主改选时临时记录的“申请人另一件闲置” id。
   * 非空且 status = RESELECTING 时，from_item_id 仍是原候选物品，
   * 等申请人确认后才覆盖到 from_item_id；拒绝/完成后清空为 null。
   */
  reselect_from_item_id: string | null;
  status: ExchangeStatus;
  message: string;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<
  Exchange,
  'id' | 'status' | 'created_at' | 'updated_at' | 'reselect_from_item_id'
> & {
  status?: ExchangeStatus;
  reselect_from_item_id?: string | null;
};
