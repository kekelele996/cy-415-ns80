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
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.exchanges, [nextExchange, ...exchanges]);
    return nextExchange;
  },

  /**
   * 物主改选：从申请人当前可交换的物品里另选一件，提交后等待申请人确认。
   * 不改写 from_item_id，原候选物品仍保持可交换、可被别人申请。
   */
  async reselect(id: string, proposedFromItemId: string): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (current.status !== ExchangeStatus.PENDING) {
      throw new Error('该交换请求已处理，不能再改选');
    }

    const [targetItem, offeredItem, proposedItem] = await Promise.all([
      itemApi.detail(current.to_item_id),
      itemApi.detail(current.from_item_id),
      itemApi.detail(proposedFromItemId),
    ]);

    // 物品归属变化（任何一方物品不再属于原交换双方）时，改选不能写入
    if (!targetItem || targetItem.user_id !== current.to_user_id) {
      throw new Error('交换物品归属已变化，不能改选');
    }
    if (!offeredItem || offeredItem.user_id !== current.from_user_id) {
      throw new Error('交换物品归属已变化，不能改选');
    }
    if (!proposedItem) {
      throw new Error('所选物品不存在');
    }
    if (proposedItem.user_id !== current.from_user_id) {
      throw new Error('只能从申请人发布的物品里改选');
    }
    if (proposedItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('所选物品当前不可交换');
    }
    if (proposedItem.id === current.from_item_id) {
      throw new Error('改选物品与原候选物品相同，无需改选');
    }

    const nextExchange: Exchange = {
      ...current,
      proposed_from_item_id: proposedFromItemId,
      status: ExchangeStatus.RESELECTED,
      updated_at: new Date().toISOString(),
    };
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },

  /**
   * 申请人接受改选：交换对象以改选结果为准，进入已同意；
   * 所选物品此时不再可交换则拒绝写入，双方物品都不变。
   */
  async acceptReselect(id: string): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (current.status !== ExchangeStatus.RESELECTED || !current.proposed_from_item_id) {
      throw new Error('当前状态不能确认改选');
    }

    const [targetItem, proposedItem] = await Promise.all([
      itemApi.detail(current.to_item_id),
      itemApi.detail(current.proposed_from_item_id),
    ]);
    if (!targetItem || targetItem.user_id !== current.to_user_id) {
      throw new Error('交换物品归属已变化，不能确认改选');
    }
    if (!proposedItem || proposedItem.user_id !== current.from_user_id) {
      throw new Error('改选物品归属已变化，不能确认改选');
    }
    if (proposedItem.status !== ItemStatus.AVAILABLE || targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('改选物品已不可交换，不能确认');
    }

    const nextExchange: Exchange = {
      ...current,
      from_item_id: current.proposed_from_item_id,
      proposed_from_item_id: undefined,
      status: ExchangeStatus.ACCEPTED,
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
    const nextExchange: Exchange = { ...current, status, updated_at: new Date().toISOString() };
    if (status === ExchangeStatus.COMPLETED) {
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
