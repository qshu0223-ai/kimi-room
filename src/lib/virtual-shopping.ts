import {
  virtualOrderStore,
  walletTransactionStore,
  type VirtualOrderEntry,
  type WalletTransactionEntry,
} from "@/lib/stores";

export const MONTHLY_SALARY_CENTS = 500_000;

export type PurchaseInput = {
  productName: string;
  priceCents: number;
  category: string;
  image?: string;
  sourceUrl?: string;
  spec?: string;
  note?: string;
};

export type WalletSnapshot = {
  balanceCents: number;
  incomeCents: number;
  spentCents: number;
  transactions: WalletTransactionEntry[];
};

function localMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function localOrderStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertPositiveCents(amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
    throw new Error("金额需要是大于 0 的有效数字");
  }
}

export function money(cents: number): string {
  return `¥${(cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function ensureMonthlySalary(date = new Date()): Promise<WalletTransactionEntry> {
  const month = localMonthKey(date);
  const id = `wallet-salary-${month}`;
  const store = walletTransactionStore();
  const existing = await store.get(id);
  if (existing) return existing;
  return store.put({
    id,
    amountCents: MONTHLY_SALARY_CENTS,
    kind: "salary",
    title: `${Number(month.slice(5))}月工资`,
    note: "每月固定虚拟购物工资",
    sourceKey: `salary:${month}`,
  });
}

export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const rows = await walletTransactionStore().list();
  const transactions = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const balanceCents = transactions.reduce((sum, row) => sum + row.amountCents, 0);
  const incomeCents = transactions.reduce(
    (sum, row) => sum + (row.amountCents > 0 ? row.amountCents : 0),
    0,
  );
  const spentCents = transactions.reduce(
    (sum, row) => sum + (row.amountCents < 0 ? -row.amountCents : 0),
    0,
  );
  return { balanceCents, incomeCents, spentCents, transactions };
}

export async function creditWallet(input: {
  amountCents: number;
  kind: Extract<WalletTransactionEntry["kind"], "extra_income" | "allowance" | "adjustment">;
  title: string;
  note?: string;
  sourceKey?: string;
}): Promise<WalletTransactionEntry> {
  assertPositiveCents(input.amountCents);
  const store = walletTransactionStore();
  if (input.sourceKey) {
    const id = `wallet-credit-${input.sourceKey}`;
    const existing = await store.get(id);
    if (existing) return existing;
    return store.put({ ...input, id });
  }
  return store.put(input);
}

export async function creditExtraIncome(amountCents: number, note?: string) {
  return creditWallet({
    amountCents,
    kind: "extra_income",
    title: "外快入账",
    note,
  });
}

// Reserved seam for chat red packets / allowance cards. A future red-packet
// claim should pass its packet id as sourceRef so repeated taps cannot credit
// the wallet twice.
export async function creditAllowance(
  amountCents: number,
  note?: string,
  sourceRef?: string,
) {
  return creditWallet({
    amountCents,
    kind: "allowance",
    title: "老公零花钱",
    note,
    sourceKey: sourceRef ? `allowance:${sourceRef}` : undefined,
  });
}

export async function listVirtualOrders(): Promise<VirtualOrderEntry[]> {
  const rows = await virtualOrderStore().list();
  return [...rows].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export async function purchaseVirtualItem(input: PurchaseInput): Promise<{
  order: VirtualOrderEntry;
  transaction: WalletTransactionEntry;
  balanceCents: number;
}> {
  const productName = input.productName.trim();
  if (!productName) throw new Error("先写下你要买什么");
  assertPositiveCents(input.priceCents);

  const snapshot = await getWalletSnapshot();
  if (snapshot.balanceCents < input.priceCents) {
    throw new Error(`余额还差 ${money(input.priceCents - snapshot.balanceCents)}`);
  }

  const now = new Date();
  const orderId = newId("virtual-order");
  const orderNo = `AN${localOrderStamp(now)}${Math.floor(Math.random() * 900 + 100)}`;
  const transaction = await walletTransactionStore().put({
    amountCents: -input.priceCents,
    kind: "purchase",
    title: `购买 · ${productName}`,
    orderId,
  });

  try {
    const order = await virtualOrderStore().put({
      id: orderId,
      orderNo,
      productName,
      priceCents: input.priceCents,
      category: input.category || "其他",
      image: input.image,
      sourceUrl: input.sourceUrl?.trim() || undefined,
      spec: input.spec?.trim() || undefined,
      note: input.note?.trim() || undefined,
      paidAt: now.toISOString(),
      status: "paid",
      walletTransactionId: transaction.id,
    });
    return {
      order,
      transaction,
      balanceCents: snapshot.balanceCents - input.priceCents,
    };
  } catch (error) {
    await walletTransactionStore().delete(transaction.id).catch(() => undefined);
    throw error;
  }
}