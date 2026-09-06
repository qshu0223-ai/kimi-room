import { KimiPage, KimiTopNav } from "@/components/mucha/KimiPage";
import { VirtualShopping } from "@/components/shopping/VirtualShopping";
import { palGold } from "@/lib/kimi-palettes";
import { getTheme } from "@/lib/day-theme";

export default async function CollectionPage() {
  const theme = await getTheme();
  const P = palGold(theme);

  return (
    <KimiPage P={P} vines={false}>
      <KimiTopNav title="COLLECTION" sub="shopping" icon="¥" P={P} />
      <div style={{ textAlign: "center", padding: "5px 24px 10px" }}>
        <div
          style={{
            fontSize: 25,
            color: P.ink,
            letterSpacing: 1.5,
            fontFamily: "var(--font-serif)",
          }}
        >
          collection
        </div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: 3.2,
            color: P.mute,
            fontStyle: "italic",
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          buy it here · keep it here
        </div>
      </div>
      <VirtualShopping P={P} />
    </KimiPage>
  );
}
