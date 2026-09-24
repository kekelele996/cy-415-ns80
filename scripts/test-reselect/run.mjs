/* 改选流程逻辑验证。Run: node scripts/test-reselect/run.mjs */
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync, rmSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const root = path.resolve(here, '../..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
// esbuild 是 vite 的传递依赖，借助 vite 的安装路径解析，避免在 package.json 增加测试依赖
const viteDir = path.dirname(requireFromRoot.resolve('vite/package.json'));
const requireFromVite = createRequire(path.join(viteDir, 'index.js'));
const { build } = requireFromVite('esbuild');

const ENTRY = path.join(here, 'entry.ts');
const SHIM = path.join(here, 'storage-shim.mjs');
const OUT = path.join(os.tmpdir(), `reswap-reselect-bundle-${process.pid}.mjs`);

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@/utils/storage': SHIM },
});
writeFileSync(OUT, result.outputFiles[0].text);
try {
  const { itemApi, exchangeApi, ItemStatus, ExchangeStatus } = await import(pathToFileURL(OUT).href);
  await run(itemApi, exchangeApi, ItemStatus, ExchangeStatus);
} finally {
  rmSync(OUT, { force: true });
}

async function run(itemApi, exchangeApi, ItemStatus, ExchangeStatus) {

let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};
const throws = async (fn, match, label) => {
  try {
    await fn();
  } catch (error) {
    if (match && !String(error.message).includes(match)) {
      throw new Error(`FAIL: ${label} — 错误信息不符：${error.message}`);
    }
    passed += 1;
    console.log(`  ✓ ${label}（拦截：${error.message}）`);
    return;
  }
  throw new Error(`FAIL: ${label} — 预期应报错`);
};

const makeItem = (user, status = ItemStatus.AVAILABLE) =>
  itemApi.create({
    user_id: user,
    title: `item-${Math.random().toString(16).slice(2, 7)}`,
    description: 'test',
    category: '其他',
    condition: 'good',
    images: [],
    location: 'test',
    status,
  });

const makeItems = async (user, n, status = ItemStatus.AVAILABLE) => {
  const list = [];
  for (let i = 0; i < n; i += 1) {
    // 顺序创建，避免 createId 计数器在并发下撞号
    list.push(await makeItem(user, status));
  }
  return list;
};

const A = 'user_me'; // 申请人
const B = 'user_lin'; // 物主

// 初始化种子
await itemApi.list();
await exchangeApi.list();

/* ============ 场景一：改选 → 接受 → 完成 ============ */
console.log('场景一：物主改选，申请人接受，最终完成');
const a = await makeItems(A, 2); const [a1, a2] = a; const [b1] = await makeItems(B, 1);
const ex1 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: a1.id, to_item_id: b1.id, message: '',
});

console.log('  -- 提交改选');
await exchangeApi.reselect(ex1.id, a2.id);
let cur = (await exchangeApi.list()).find((x) => x.id === ex1.id);
ok(cur.status === ExchangeStatus.RESELECTED, '状态变为「改选待确认」');
ok(cur.proposed_from_item_id === a2.id, '记录改选候选物品');
ok(cur.from_item_id === a1.id, '原候选物品 ID 未改写');
ok((await itemApi.detail(a1.id)).status === ItemStatus.AVAILABLE, '原候选物品仍可交换（能被别人申请）');
ok((await itemApi.detail(a2.id)).status === ItemStatus.AVAILABLE, '改选候选物品也未被锁定');

console.log('  -- 改选期间的非法操作');
await throws(() => exchangeApi.reselect(ex1.id, a2.id), '已处理', '不能重复改选');
await throws(() => exchangeApi.transition(ex1.id, ExchangeStatus.ACCEPTED), '不允许', '不能跳过确认直接同意');
await throws(() => exchangeApi.transition(ex1.id, ExchangeStatus.COMPLETED), '不允许', '不能直接完成');

console.log('  -- 申请人接受改选');
await exchangeApi.acceptReselect(ex1.id);
cur = (await exchangeApi.list()).find((x) => x.id === ex1.id);
ok(cur.status === ExchangeStatus.ACCEPTED, '状态变为已同意');
ok(cur.from_item_id === a2.id, '交换对象以改选结果为准');
ok(cur.proposed_from_item_id === undefined, '候选标记已清除');
ok((await itemApi.detail(a1.id)).status === ItemStatus.AVAILABLE, '原候选物品未受影响');

console.log('  -- 完成交换');
await exchangeApi.transition(ex1.id, ExchangeStatus.COMPLETED);
ok((await itemApi.detail(a2.id)).status === ItemStatus.EXCHANGED, '改选后的物品标记已交换');
ok((await itemApi.detail(b1.id)).status === ItemStatus.EXCHANGED, '物主物品标记已交换');
ok((await itemApi.detail(a1.id)).status === ItemStatus.AVAILABLE, '原候选物品保持可交换，未被标记');

/* ============ 场景二：改选 → 拒绝 → 请求结束，物品都不变 ============ */
console.log('场景二：申请人拒绝改选，请求结束，双方物品都不变');
const c = await makeItems(A, 2); const [c1, c2] = c; const [d1] = await makeItems(B, 1);
const ex2 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: c1.id, to_item_id: d1.id, message: '',
});
await exchangeApi.reselect(ex2.id, c2.id);
await exchangeApi.transition(ex2.id, ExchangeStatus.REJECTED);
cur = (await exchangeApi.list()).find((x) => x.id === ex2.id);
ok(cur.status === ExchangeStatus.REJECTED, '状态变为已拒绝，请求结束');
ok(cur.from_item_id === c1.id, '拒绝后约定物品仍是原候选');
ok((await itemApi.detail(c1.id)).status === ItemStatus.AVAILABLE, '原候选物品不变');
ok((await itemApi.detail(c2.id)).status === ItemStatus.AVAILABLE, '改选候选物品不变');
ok((await itemApi.detail(d1.id)).status === ItemStatus.AVAILABLE, '物主物品不变');

/* ============ 场景三：改选写入守卫 ============ */
console.log('场景三：改选写入守卫');
const e = await makeItems(A, 2); const [e1, e2] = e; const [f1] = await makeItems(B, 1);
const ex3 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: e1.id, to_item_id: f1.id, message: '',
});
await throws(() => exchangeApi.reselect(ex3.id, e1.id), '相同', '不能改选为原候选物品');
await throws(() => exchangeApi.reselect(ex3.id, b1.id), '申请人', '不能选非申请人的物品（b1 属于物主且已交换）');
const otherOwned = await makeItem('user_chen');
await throws(() => exchangeApi.reselect(ex3.id, otherOwned.id), '申请人', '不能选第三方用户的物品');
const e2offline = await makeItem(A, ItemStatus.OFFLINE);
await throws(() => exchangeApi.reselect(ex3.id, e2offline.id), '不可交换', '所选物品已下架时不能写入');
const e2exchanged = await makeItem(A, ItemStatus.EXCHANGED);
await throws(() => exchangeApi.reselect(ex3.id, e2exchanged.id), '不可交换', '所选物品已交换时不能写入');

// 物品归属变化：申请人原候选物品易主
await itemApi.update(e1.id, { user_id: 'user_chen' });
await throws(() => exchangeApi.reselect(ex3.id, e2.id), '归属', '原候选物品归属变化时改选被拦截');
await itemApi.update(e1.id, { user_id: A });
// 物主物品易主
await itemApi.update(f1.id, { user_id: 'user_chen' });
await throws(() => exchangeApi.reselect(ex3.id, e2.id), '归属', '物主物品归属变化时改选被拦截');
await itemApi.update(f1.id, { user_id: B });

// 请求已处理：拒绝后不能改选；同意后也不能
await exchangeApi.transition(ex3.id, ExchangeStatus.REJECTED);
await throws(() => exchangeApi.reselect(ex3.id, e2.id), '已处理', '已拒绝的请求不能改选');

const g = await makeItems(A, 2); const [g1, g2] = g; const [h1] = await makeItems(B, 1);
const ex4 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: g1.id, to_item_id: h1.id, message: '',
});
await exchangeApi.transition(ex4.id, ExchangeStatus.ACCEPTED);
await throws(() => exchangeApi.reselect(ex4.id, g2.id), '已处理', '已同意的请求不能改选');

/* ============ 场景四：接受改选时二次校验 ============ */
console.log('场景四：申请人确认时所选物品已不可交换 / 归属变化');
const i = await makeItems(A, 2); const [i1, i2] = i; const [j1] = await makeItems(B, 1);
const ex5 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: i1.id, to_item_id: j1.id, message: '',
});
await exchangeApi.reselect(ex5.id, i2.id);
await itemApi.setStatus(i2.id, ItemStatus.OFFLINE);
await throws(() => exchangeApi.acceptReselect(ex5.id), '不可交换', '候选已下架，接受被拦截');
cur = (await exchangeApi.list()).find((x) => x.id === ex5.id);
ok(cur.status === ExchangeStatus.RESELECTED, '拦截后仍停留在改选待确认');
ok(cur.from_item_id === i1.id, '拦截后约定物品不变');

await itemApi.setStatus(i2.id, ItemStatus.AVAILABLE);
await itemApi.update(i2.id, { user_id: 'user_chen' });
await throws(() => exchangeApi.acceptReselect(ex5.id), '归属', '候选归属变化，接受被拦截');
await itemApi.update(i2.id, { user_id: A });

// 物主物品在确认期间下架也应拦截
await itemApi.setStatus(j1.id, ItemStatus.OFFLINE);
await throws(() => exchangeApi.acceptReselect(ex5.id), '不可交换', '物主物品已下架时接受被拦截');
await itemApi.setStatus(j1.id, ItemStatus.AVAILABLE);

// 恢复后接受成功并完成
await exchangeApi.acceptReselect(ex5.id);
cur = (await exchangeApi.list()).find((x) => x.id === ex5.id);
ok(cur.status === ExchangeStatus.ACCEPTED && cur.from_item_id === i2.id, '恢复后接受成功，对象为改选结果');

/* ============ 场景五：非 RESELECTED 状态调用 acceptReselect ============ */
console.log('场景五：acceptReselect 状态守卫');
const k = await makeItems(A, 2); const [k1, k2] = k; const [l1] = await makeItems(B, 1);
const ex6 = await exchangeApi.create({
  from_user_id: A, to_user_id: B, from_item_id: k1.id, to_item_id: l1.id, message: '',
});
await throws(() => exchangeApi.acceptReselect(ex6.id), '不能确认', '待确认状态不能确认改选');
await exchangeApi.reselect(ex6.id, k2.id);
await exchangeApi.transition(ex6.id, ExchangeStatus.REJECTED);
await throws(() => exchangeApi.acceptReselect(ex6.id), '不能确认', '已拒绝状态不能确认改选');

console.log(`\n全部 ${passed} 项断言通过`);
}
