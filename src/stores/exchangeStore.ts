import { defineStore } from 'pinia';

import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { message, messageAsync } from '@/utils/message';

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.exchanges = await exchangeApi.list();
      } finally {
        this.loading = false;
      }
    },
    async create(draft: ExchangeDraft) {
      const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
      this.exchanges = await exchangeApi.list();
      message('交换请求已发出', 'success');
      return exchange;
    },
    async accept(id: string) {
      await exchangeApi.transition(id, ExchangeStatus.ACCEPTED);
      this.exchanges = await exchangeApi.list();
      message('已同意交换', 'success');
    },
    async reject(id: string) {
      await exchangeApi.transition(id, ExchangeStatus.REJECTED);
      this.exchanges = await exchangeApi.list();
      message('已拒绝交换', 'success');
    },
    /** 物主从申请人当前可交换的物品里另选一件，提交后待申请人确认 */
    async proposeReselect(id: string, reselectFromItemId: string, operatorId: string) {
      await messageAsync(
        () => exchangeApi.proposeReselect(id, reselectFromItemId, operatorId),
        '改选请求已提交，等待申请人确认',
      );
      this.exchanges = await exchangeApi.list();
    },
    /** 申请人接受改选，交换对象以改选结果为准 */
    async acceptReselect(id: string, operatorId: string) {
      await messageAsync(() => exchangeApi.acceptReselect(id, operatorId), '已接受改选，交换对象已更新');
      this.exchanges = await exchangeApi.list();
    },
    /** 申请人拒绝改选，请求结束，双方物品都不变 */
    async rejectReselect(id: string, operatorId: string) {
      await messageAsync(() => exchangeApi.rejectReselect(id, operatorId), '已拒绝改选，本次交换请求结束');
      this.exchanges = await exchangeApi.list();
    },
    async complete(id: string) {
      await exchangeApi.transition(id, ExchangeStatus.COMPLETED);
      this.exchanges = await exchangeApi.list();
      message('交换已完成，双方物品状态已更新', 'success');
    },
  },
});
