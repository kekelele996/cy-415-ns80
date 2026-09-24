export enum ExchangeStatus {
  PENDING = 'pending',
  RESELECTING = 'reselecting',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

export const EXCHANGE_STATUS_OPTIONS = [
  { label: '待确认', value: ExchangeStatus.PENDING },
  { label: '改选待确认', value: ExchangeStatus.RESELECTING },
  { label: '已同意', value: ExchangeStatus.ACCEPTED },
  { label: '已拒绝', value: ExchangeStatus.REJECTED },
  { label: '已完成', value: ExchangeStatus.COMPLETED },
];

export const EXCHANGE_ACTION_FLOW: Record<ExchangeStatus, ExchangeStatus[]> = {
  [ExchangeStatus.PENDING]: [ExchangeStatus.ACCEPTED, ExchangeStatus.REJECTED],
  // 改选待确认只能走专属的改选确认/拒绝动作，不能套用通用的同意/拒绝流转
  [ExchangeStatus.RESELECTING]: [],
  [ExchangeStatus.ACCEPTED]: [ExchangeStatus.COMPLETED],
  [ExchangeStatus.REJECTED]: [],
  [ExchangeStatus.COMPLETED]: [],
};

export const EXCHANGE_STORAGE_HINTS = {
  statusKey: 'reswap:exchanges',
  statusTouchedBy: ['models/exchange.ts', 'stores/exchangeStore.ts', 'components/common/ExchangeCard.vue'],
};
