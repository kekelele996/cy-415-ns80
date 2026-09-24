import { EXCHANGE_ACTION_FLOW, ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import type { Exchange, ExchangeDraft } from '@/models/exchange';

import { itemApi } from './itemApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const seedExchanges: Exchange[] = [
  {
    id: 'exchange_seed',
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    reselect_from_item_id: null,
    status: ExchangeStatus.PENDING,
    message: '露营椅换拍立得，可以同城当面交换。',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const exchanges = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
    if (exchanges.length) return exchanges;
    await storage.set(STORAGE_KEYS.exchanges, seedExchanges);
    return seedExchanges;
  },

  async create(draft: ExchangeDraft): Promise<Exchange> {
    const exchanges = await this.list();
    const targetItem = await itemApi.detail(draft.to_item_id);
    if (!targetItem || targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('目标物品当前不可交换');
    }
    const nextExchange: Exchange = {
      ...draft,
      reselect_from_item_id: null,
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.exchanges, [nextExchange, ...exchanges]);
    return nextExchange;
  },

  /**
   * 物主改选：从申请人当前可交换的物品里另选一件，
   * 提交后进入 RESELECTING 待申请人确认，不修改任何物品状态，
   * 原候选物品仍可被别人申请。
   */
  async proposeReselect(id: string, reselectFromItemId: string, operatorId: string): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    // 请求已处理（改选待确认/已同意/已拒绝/已完成）都不能再写入改选
    if (current.status !== ExchangeStatus.PENDING) {
      throw new Error('请求已处理，不能改选');
    }
    if (current.to_user_id !== operatorId) {
      throw new Error('只有物主可以改选');
    }
    if (reselectFromItemId === current.from_item_id) {
      throw new Error('改选物品不能与原候选物品相同');
    }
    const reselectItem = await itemApi.detail(reselectFromItemId);
    if (!reselectItem || reselectItem.user_id !== current.from_user_id) {
      throw new Error('只能改选为申请人发布的物品');
    }
    // 所选物品不再可交换（含归属已变化）时，改选不能写入
    if (reselectItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('所选物品当前不再可交换');
    }
    // 物主自己的物品归属已变化（已被换走）时，改选不能写入
    const ownerItem = await itemApi.detail(current.to_item_id);
    if (!ownerItem || ownerItem.status === ItemStatus.EXCHANGED) {
      throw new Error('原目标物品归属已变化，不能改选');
    }
    const nextExchange: Exchange = {
      ...current,
      reselect_from_item_id: reselectFromItemId,
      status: ExchangeStatus.RESELECTING,
      updated_at: new Date().toISOString(),
    };
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },

  /**
   * 申请人接受改选：交换对象以改选结果为准（覆盖 from_item_id），
   * 回到已同意流程，原候选物品保持原状、不锁定。
   */
  async acceptReselect(id: string, operatorId: string): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (current.status !== ExchangeStatus.RESELECTING) {
      throw new Error('当前没有待确认的改选');
    }
    if (current.from_user_id !== operatorId) {
      throw new Error('只有申请人可以确认改选');
    }
    const reselectFromItemId = current.reselect_from_item_id;
    if (!reselectFromItemId) throw new Error('改选物品信息缺失');
    // 提交改选后物品被下架/换走，接受时一并拦截，双方物品都不变
    const reselectItem = await itemApi.detail(reselectFromItemId);
    if (!reselectItem || reselectItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('改选物品当前不再可交换，无法接受');
    }
    const nextExchange: Exchange = {
      ...current,
      from_item_id: reselectFromItemId,
      reselect_from_item_id: null,
      status: ExchangeStatus.ACCEPTED,
      updated_at: new Date().toISOString(),
    };
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },

  /**
   * 申请人拒绝改选：请求结束（已拒绝），双方物品都不变。
   */
  async rejectReselect(id: string, operatorId: string): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (current.status !== ExchangeStatus.RESELECTING) {
      throw new Error('当前没有待确认的改选');
    }
    if (current.from_user_id !== operatorId) {
      throw new Error('只有申请人可以拒绝改选');
    }
    const nextExchange: Exchange = {
      ...current,
      reselect_from_item_id: null,
      status: ExchangeStatus.REJECTED,
      updated_at: new Date().toISOString(),
    };
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },

  async transition(id: string, status: ExchangeStatus): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }
    const nextExchange: Exchange = {
      ...current,
      status,
      reselect_from_item_id: null,
      updated_at: new Date().toISOString(),
    };
    if (status === ExchangeStatus.COMPLETED) {
      // 只把最终约定的两件物品标为已交换；改选被接受时 from_item_id 已是改选结果
      await itemApi.setStatus(current.from_item_id, ItemStatus.EXCHANGED);
      await itemApi.setStatus(current.to_item_id, ItemStatus.EXCHANGED);
    }
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },
};
