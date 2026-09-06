"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import type { KimiPalette } from "@/lib/kimi-palettes";
import {
  creditExtraIncome,
  ensureMonthlySalary,
  getWalletSnapshot,
  listVirtualOrders,
  money,
  purchaseVirtualItem,
} from "@/lib/virtual-shopping";
import type { VirtualOrderEntry, WalletTransactionEntry } from "@/lib/stores";

type Tab = "buy" | "orders" | "collection";

const CATEGORIES = ["包袋", "衣服", "鞋子", "首饰", "文具", "书影音", "家居", "其他"];

function yuanToCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VirtualShopping({ P }: { P: KimiPalette }) {
  const [tab, setTab] = useState<Tab>("buy");
  const [transactions, setTransactions] = useState<WalletTransactionEntry[]>([]);
  const [orders, setOrders] = useState<VirtualOrderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("其他");
  const [spec, setSpec] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [image, setImage] = useState("");
  const [note, setNote] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<{ amountCents: number; balanceCents: number; orderNo: string } | null>(null);

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeNote, setIncomeNote] = useState("");
  const [addingIncome, setAddingIncome] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("全部");

  const refresh = async () => {
    const [wallet, orderRows] = await Promise.all([getWalletSnapshot(), listVirtualOrders()]);
    setTransactions(wallet.transactions);
    setOrders(orderRows);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await ensureMonthlySalary();
        if (!active) return;
        await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const balanceCents = useMemo(
    () => transactions.reduce((sum, row) => sum + row.amountCents, 0),
    [transactions],
  );
  const spentCents = useMemo(
    () => transactions.reduce((sum, row) => sum + (row.amountCents < 0 ? -row.amountCents : 0), 0),
    [transactions],
  );
  const priceCents = yuanToCents(price);
  const collectionValue = useMemo(
    () => orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + o.priceCents, 0),
    [orders],
  );
  const filteredOrders = collectionFilter === "全部"
    ? orders.filter((o) => o.status === "paid")
    : orders.filter((o) => o.status === "paid" && o.category === collectionFilter);

  const panel: CSSProperties = {
    border: `1px solid ${P.hair}`,
    background: P.paper,
    borderRadius: 22,
    boxShadow: `0 18px 50px ${P.hairSoft}`,
  };
  const input: CSSProperties = {
    width: "100%",
    border: `1px solid ${P.hair}`,
    background: P.card,
    color: P.ink,
    borderRadius: 14,
    padding: "12px 13px",
    outline: "none",
    fontSize: 14,
    fontFamily: "inherit",
  };
  const smallLabel: CSSProperties = {
    display: "block",
    color: P.mute,
    fontSize: 10,
    letterSpacing: 1.8,
    marginBottom: 6,
  };
  const primaryButton: CSSProperties = {
    width: "100%",
    border: `1px solid ${P.accent}`,
    background: P.accent,
    color: P.bg,
    borderRadius: 16,
    minHeight: 48,
    fontFamily: "inherit",
    fontSize: 14,
    letterSpacing: 1,
    cursor: "pointer",
  };
  const ghostButton: CSSProperties = {
    border: `1px solid ${P.hair}`,
    background: P.chipTint,
    color: P.ink,
    borderRadius: 999,
    padding: "8px 13px",
    fontFamily: "inherit",
    fontSize: 11,
    cursor: "pointer",
  };

  const onImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError("图片先控制在 3MB 以内，收藏页会更轻快");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const resetProduct = () => {
    setProductName("");
    setPrice("");
    setCategory("其他");
    setSpec("");
    setSourceUrl("");
    setImage("");
    setNote("");
    setCheckout(false);
  };

  const openCheckout = () => {
    setError("");
    if (!productName.trim()) return setError("先写下你要买什么");
    if (priceCents <= 0) return setError("价格还没填好");
    setCheckout(true);
  };

  const confirmPay = async () => {
    if (paying) return;
    setPaying(true);
    setError("");
    try {
      const result = await purchaseVirtualItem({
        productName,
        priceCents,
        category,
        spec,
        sourceUrl,
        image,
        note,
      });
      await refresh();
      setCheckout(false);
      setSuccess({
        amountCents: priceCents,
        balanceCents: result.balanceCents,
        orderNo: result.order.orderNo,
      });
      resetProduct();
    } catch (e) {
      setError((e as Error).message);
      setCheckout(false);
    } finally {
      setPaying(false);
    }
  };

  const addIncome = async () => {
    const amountCents = yuanToCents(incomeAmount);
    if (amountCents <= 0) return setError("外快金额还没填好");
    setAddingIncome(true);
    setError("");
    try {
      await creditExtraIncome(amountCents, incomeNote.trim() || undefined);
      await refresh();
      setIncomeAmount("");
      setIncomeNote("");
      setIncomeOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingIncome(false);
    }
  };

  return (
    <div style={{ padding: "8px 16px 56px" }}>
      <section style={{ ...panel, padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: P.mute }}>ANAN'S WALLET</div>
            <div style={{ fontSize: 32, lineHeight: 1.1, marginTop: 7, color: P.ink }}>
              {loading ? "…" : money(balanceCents)}
            </div>
            <div style={{ fontSize: 10, color: P.mute, marginTop: 7 }}>
              本月工资自动到账 ¥5,000 · 已虚拟消费 {money(spentCents)}
            </div>
          </div>
          <button type="button" style={ghostButton} onClick={() => setIncomeOpen((v) => !v)}>
            ＋ 外快
          </button>
        </div>

        {incomeOpen ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${P.hair}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 8 }}>
              <input style={input} inputMode="decimal" placeholder="入账金额" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} />
              <input style={input} placeholder="备注：稿费 / 项目…" value={incomeNote} onChange={(e) => setIncomeNote(e.target.value)} />
            </div>
            <button type="button" style={{ ...primaryButton, minHeight: 42, marginTop: 9 }} disabled={addingIncome} onClick={addIncome}>
              {addingIncome ? "入账中…" : "确认入账"}
            </button>
          </div>
        ) : null}
      </section>

      <nav style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, margin: "14px 0" }}>
        {([
          ["buy", "去买"],
          ["orders", "订单"],
          ["collection", "收藏"],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              ...ghostButton,
              borderRadius: 14,
              background: tab === key ? P.chipSelTint : P.chipTint,
              borderColor: tab === key ? P.accent : P.hair,
              color: tab === key ? P.accent : P.ink,
              padding: "11px 8px",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <div style={{ ...panel, padding: "11px 13px", marginBottom: 12, color: P.accent, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {tab === "buy" ? (
        <section style={{ ...panel, padding: 17 }}>
          <div style={{ fontSize: 19, color: P.ink, marginBottom: 3 }}>今天想买什么？</div>
          <div style={{ fontSize: 10, color: P.mute, marginBottom: 18 }}>把现实购物车搬进来，在这里真的结一次账。</div>

          <div style={{ display: "grid", gap: 13 }}>
            <label>
              <span style={smallLabel}>商品名称 *</span>
              <input style={input} placeholder="例如：黑色托特包" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 9 }}>
              <label>
                <span style={smallLabel}>价格 *</span>
                <input style={input} inputMode="decimal" placeholder="899" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label>
                <span style={smallLabel}>分类</span>
                <select style={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <label>
              <span style={smallLabel}>规格 / 颜色</span>
              <input style={input} placeholder="黑色 / 28cm / M…" value={spec} onChange={(e) => setSpec(e.target.value)} />
            </label>
            <label>
              <span style={smallLabel}>原商品链接</span>
              <input style={input} placeholder="贴过来，之后想回看还能找到" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </label>
            <div>
              <span style={smallLabel}>商品图</span>
              {image ? (
                <div style={{ position: "relative", height: 190, borderRadius: 18, overflow: "hidden", border: `1px solid ${P.hair}`, marginBottom: 8 }}>
                  <img src={image} alt="商品预览" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => setImage("")} style={{ ...ghostButton, position: "absolute", right: 8, top: 8, background: P.paper }}>移除</button>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input style={input} placeholder="图片 URL，或从设备选一张" value={image.startsWith("data:") ? "" : image} onChange={(e) => setImage(e.target.value)} />
                <label style={{ ...ghostButton, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingInline: 14 }}>
                  选图
                  <input type="file" accept="image/*" onChange={onImageFile} style={{ display: "none" }} />
                </label>
              </div>
            </div>
            <label>
              <span style={smallLabel}>这一刻为什么想买</span>
              <textarea style={{ ...input, minHeight: 76, resize: "vertical" }} placeholder="可不填。以后回看时会很有意思。" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", color: P.mute, fontSize: 11, margin: "18px 2px 8px" }}>
            <span>钱包余额</span><span>{money(balanceCents)}</span>
          </div>
          <button type="button" style={primaryButton} onClick={openCheckout}>
            去结算{priceCents > 0 ? ` · ${money(priceCents)}` : ""}
          </button>
        </section>
      ) : null}

      {tab === "orders" ? (
        <section style={{ display: "grid", gap: 10 }}>
          {orders.length === 0 ? <Empty panel={panel} P={P} text="还没有订单。第一件就买你现在看中的那个。" /> : orders.map((order) => (
            <article key={order.id} style={{ ...panel, padding: 13, display: "grid", gridTemplateColumns: order.image ? "76px 1fr" : "1fr", gap: 13 }}>
              {order.image ? <img src={order.image} alt="" style={{ width: 76, height: 76, borderRadius: 14, objectFit: "cover" }} /> : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong style={{ fontSize: 14, color: P.ink }}>{order.productName}</strong>
                  <strong style={{ fontSize: 14, color: P.accent }}>{money(order.priceCents)}</strong>
                </div>
                <div style={{ fontSize: 10, color: P.mute, marginTop: 5 }}>{order.spec || order.category} · {when(order.paidAt)}</div>
                <div style={{ fontSize: 9, color: P.mute, marginTop: 8, letterSpacing: .5 }}>订单 {order.orderNo}</div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "collection" ? (
        <section>
          <div style={{ ...panel, padding: "15px 16px", marginBottom: 11, display: "flex", justifyContent: "space-between", alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 10, color: P.mute, letterSpacing: 1.6 }}>MY COLLECTION</div>
              <div style={{ fontSize: 22, marginTop: 4 }}>{orders.filter((o) => o.status === "paid").length} 件</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: P.mute }}>收藏价值</div>
              <div style={{ fontSize: 17, color: P.accent, marginTop: 3 }}>{money(collectionValue)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 9 }}>
            {["全部", ...CATEGORIES].map((item) => (
              <button key={item} type="button" style={{ ...ghostButton, flex: "0 0 auto", background: collectionFilter === item ? P.chipSelTint : P.chipTint, color: collectionFilter === item ? P.accent : P.ink }} onClick={() => setCollectionFilter(item)}>{item}</button>
            ))}
          </div>
          {filteredOrders.length === 0 ? <Empty panel={panel} P={P} text="这个柜子还是空的。" /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
              {filteredOrders.map((order) => (
                <article key={order.id} style={{ ...panel, overflow: "hidden" }}>
                  <div style={{ height: 150, background: P.chipTint, display: "flex", alignItems: "center", justifyContent: "center", color: P.mute, fontSize: 11 }}>
                    {order.image ? <img src={order.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : order.category}
                  </div>
                  <div style={{ padding: "11px 12px 13px" }}>
                    <div style={{ fontSize: 13, lineHeight: 1.35, color: P.ink }}>{order.productName}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 7, fontSize: 10, color: P.mute }}>
                      <span>{order.category}</span><span>{money(order.priceCents)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {checkout ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.48)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 14 }} onClick={() => !paying && setCheckout(false)}>
          <div style={{ ...panel, width: "min(100%,420px)", padding: 20, marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: P.mute }}>CONFIRM PAYMENT</div>
            <div style={{ fontSize: 19, marginTop: 8 }}>{productName}</div>
            {spec ? <div style={{ color: P.mute, fontSize: 11, marginTop: 4 }}>{spec}</div> : null}
            <div style={{ fontSize: 35, color: P.accent, marginTop: 20 }}>{money(priceCents)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: P.mute, margin: "8px 1px 18px" }}>
              <span>支付后余额</span><span>{money(balanceCents - priceCents)}</span>
            </div>
            <button type="button" disabled={paying} onClick={confirmPay} style={primaryButton}>{paying ? "支付中…" : "确认支付"}</button>
            <button type="button" disabled={paying} onClick={() => setCheckout(false)} style={{ ...ghostButton, width: "100%", marginTop: 8, borderRadius: 14 }}>再想一下</button>
          </div>
        </div>
      ) : null}

      {success ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.52)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ ...panel, width: "min(100%,390px)", padding: "30px 22px 22px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: P.mute, letterSpacing: 2.4 }}>PAYMENT SUCCESS</div>
            <div style={{ fontSize: 23, marginTop: 10 }}>支付成功</div>
            <div style={{ fontSize: 38, color: P.accent, marginTop: 12 }}>{money(success.amountCents)}</div>
            <div style={{ fontSize: 11, color: P.mute, marginTop: 12 }}>订单已生成 · {success.orderNo}</div>
            <div style={{ fontSize: 12, color: P.ink, marginTop: 6 }}>余额 {money(success.balanceCents)}</div>
            <button type="button" style={{ ...primaryButton, marginTop: 22 }} onClick={() => { setSuccess(null); setTab("collection"); }}>去收藏看看</button>
            <button type="button" style={{ ...ghostButton, width: "100%", borderRadius: 14, marginTop: 8 }} onClick={() => setSuccess(null)}>继续逛</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Empty({ panel, P, text }: { panel: CSSProperties; P: KimiPalette; text: string }) {
  return <div style={{ ...panel, padding: "34px 18px", textAlign: "center", color: P.mute, fontSize: 12 }}>{text}</div>;
}
