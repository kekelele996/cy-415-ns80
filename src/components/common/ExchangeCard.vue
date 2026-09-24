<template>
  <article class="exchange-card">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>{{ formatDate(exchange.updated_at) }}</small>
    </header>
    <div class="exchange-card__items">
      <div>
        <span>{{ isReselected ? '拿出（改选后）' : '拿出' }}</span>
        <strong>{{ effectiveFromItem?.title ?? '未知物品' }}</strong>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
      </div>
    </div>
    <p v-if="isReselected && originalFromItem" class="exchange-card__reselect-note">
      原候选物品「{{ originalFromItem.title }}」仍保持可交换；{{ RESELECT_MESSAGES.awaiting }}
    </p>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>

    <form v-if="showReselectPanel" class="exchange-card__reselect" @submit.prevent="submitReselect">
      <label>
        另选申请人的物品
        <select v-model="reselectItemId">
          <option value="">{{ RESELECT_MESSAGES.needPick }}</option>
          <option v-for="candidate in reselectCandidates" :key="candidate.id" :value="candidate.id">
            {{ candidate.title }}
          </option>
        </select>
      </label>
      <p v-if="!reselectCandidates.length" class="form-note">{{ RESELECT_MESSAGES.noCandidates }}</p>
      <div class="exchange-card__actions">
        <button type="submit" :disabled="!reselectItemId">提交改选</button>
        <button type="button" @click="closeReselectPanel">取消</button>
      </div>
    </form>

    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canShowActions" class="exchange-card__actions">
        <template v-if="exchange.status === ExchangeStatus.PENDING && isOwner">
          <button type="button" @click="$emit('accept', exchange.id)">同意</button>
          <button type="button" @click="$emit('reject', exchange.id)">拒绝</button>
          <button type="button" @click="openReselectPanel">改选</button>
        </template>
        <template v-else-if="exchange.status === ExchangeStatus.RESELECTED && isApplicant">
          <button type="button" @click="$emit('accept-reselect', exchange.id)">接受改选</button>
          <button type="button" @click="$emit('reject', exchange.id)">拒绝改选</button>
        </template>
        <button
          v-if="exchange.status === ExchangeStatus.ACCEPTED"
          type="button"
          @click="$emit('complete', exchange.id)"
        >
          完成
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { RESELECT_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatExchangeStatus, formatStatusMessage, statusToneClass } from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
}>();

const emit = defineEmits<{
  accept: [id: string];
  reject: [id: string];
  complete: [id: string];
  'accept-reselect': [id: string];
  reselect: [id: string, proposedFromItemId: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const proposedFromItem = computed(() =>
  props.items.find((item) => item.id === props.exchange.proposed_from_item_id),
);
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));

const isOwner = computed(() => authStore.currentUser?.id === props.exchange.to_user_id);
const isApplicant = computed(() => authStore.currentUser?.id === props.exchange.from_user_id);
const isReselected = computed(() => props.exchange.status === ExchangeStatus.RESELECTED);
// 改选期间以候选物品展示，确认后 from_item_id 已被改写为改选结果
const effectiveFromItem = computed(() =>
  isReselected.value && proposedFromItem.value ? proposedFromItem.value : fromItem.value,
);
const originalFromItem = computed(() => fromItem.value);

const showReselectPanel = ref(false);
const reselectItemId = ref('');
// 物主只能从申请人当前可交换、且不是原候选的物品里另选
const reselectCandidates = computed(() =>
  props.items.filter(
    (item) =>
      item.user_id === props.exchange.from_user_id &&
      item.status === ItemStatus.AVAILABLE &&
      item.id !== props.exchange.from_item_id,
  ),
);

const canShowActions = computed(() => {
  if (props.exchange.status === ExchangeStatus.PENDING) return isOwner.value;
  if (props.exchange.status === ExchangeStatus.RESELECTED) return isApplicant.value;
  if (props.exchange.status === ExchangeStatus.ACCEPTED) return isOwner.value || isApplicant.value;
  return false;
});

const openReselectPanel = () => {
  reselectItemId.value = reselectCandidates.value[0]?.id ?? '';
  showReselectPanel.value = true;
};
const closeReselectPanel = () => {
  showReselectPanel.value = false;
  reselectItemId.value = '';
};
const submitReselect = () => {
  if (!reselectItemId.value) return;
  emit('reselect', props.exchange.id, reselectItemId.value);
  closeReselectPanel();
};
</script>
