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
        <span>拿出</span>
        <strong>{{ displayFromItemTitle }}</strong>
        <em v-if="isReselecting" class="exchange-card__reselect-tag">
          改选自：{{ fromItem?.title ?? '原候选物品' }}
        </em>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
      </div>
    </div>
    <div v-if="isReselecting" class="exchange-card__reselect-note">
      物主希望改选你的「{{ reselectItem?.title ?? '另一件物品' }}」，请确认；拒绝后本次请求结束，双方物品都不变。
    </div>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>

    <form v-if="reselectMode" class="exchange-card__reselect-form" @submit.prevent="submitReselect">
      <label>
        改选申请人的闲置
        <select v-model="reselectItemId">
          <option value="">选择一件对方当前可交换的物品</option>
          <option v-for="candidate in reselectCandidates" :key="candidate.id" :value="candidate.id">
            {{ candidate.title }}
          </option>
        </select>
      </label>
      <div class="exchange-card__actions">
        <button type="submit" :disabled="!reselectItemId">提交改选</button>
        <button type="button" @click="cancelReselect">取消</button>
      </div>
    </form>

    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <template v-if="exchange.status === ExchangeStatus.PENDING">
          <button type="button" @click="$emit('accept', exchange.id)">同意</button>
          <button type="button" @click="$emit('reject', exchange.id)">拒绝</button>
          <button type="button" :disabled="!reselectCandidates.length" @click="startReselect">
            改选
          </button>
        </template>
        <template v-else-if="exchange.status === ExchangeStatus.RESELECTING">
          <button type="button" @click="$emit('accept-reselect', exchange.id)">接受改选</button>
          <button type="button" @click="$emit('reject-reselect', exchange.id)">拒绝改选</button>
        </template>
        <button v-if="exchange.status === ExchangeStatus.ACCEPTED" type="button" @click="$emit('complete', exchange.id)">
          完成
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatExchangeStatus, formatStatusMessage, statusToneClass } from '@/utils/formatters';
import { message } from '@/utils/message';

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
  'reject-reselect': [id: string];
  'propose-reselect': [id: string, reselectFromItemId: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const reselectItem = computed(() =>
  props.items.find((item) => item.id === props.exchange.reselect_from_item_id),
);
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const isReselecting = computed(() => props.exchange.status === ExchangeStatus.RESELECTING);
// 改选待确认期间卡片“拿出”位置展示改选结果，原候选物品以小字附注
const displayFromItemTitle = computed(() => (isReselecting.value ? reselectItem.value?.title : fromItem.value?.title) ?? '未知物品');
const isOwner = computed(() => authStore.currentUser?.id === props.exchange.to_user_id);
const isApplicant = computed(() => authStore.currentUser?.id === props.exchange.from_user_id);
const canOperate = computed(
  () =>
    isOwner.value ||
    (isApplicant.value &&
      (props.exchange.status === ExchangeStatus.ACCEPTED ||
        props.exchange.status === ExchangeStatus.RESELECTING)),
);

// 物主可改选的范围：申请人当前可交换的物品，且不含原候选物品
const reselectCandidates = computed(() =>
  props.items.filter(
    (item) =>
      item.user_id === props.exchange.from_user_id &&
      item.status === ItemStatus.AVAILABLE &&
      item.id !== props.exchange.from_item_id,
  ),
);

const reselectMode = ref(false);
const reselectItemId = ref('');

watch(
  () => props.exchange.status,
  () => {
    reselectMode.value = false;
    reselectItemId.value = '';
  },
);

const startReselect = () => {
  if (!reselectCandidates.value.length) {
    message('申请人当前没有其他可交换物品', 'error');
    return;
  }
  reselectMode.value = true;
};

const cancelReselect = () => {
  reselectMode.value = false;
  reselectItemId.value = '';
};

const submitReselect = () => {
  if (!reselectItemId.value) {
    message('请选择一件对方的物品', 'error');
    return;
  }
  emit('propose-reselect', props.exchange.id, reselectItemId.value);
};
</script>
