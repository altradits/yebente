# Ye₿ente Brand Development Kit (BDK) & Design Architecture

**The Sovereign Design Standard for African Monetary Liberation.**

---

## 1. The Ye₿ente Brand Manifesto

Ye₿ente was born to solve a generational injustice: everyday African households pay the highest remittance and cross-border payment taxes in the world, while watching their local purchasing power eroded by double-digit currency devaluations.

### What the Name Stands For
- **"Ye" (የ)**: In Amharic and regional Ethiopian languages, the possessive prefix signifies **"of"**, **"belonging to"**, or **"for"** (*Ye-Bete* = of my house / for my home; *Ye-Sew* = of the people).
- **"₿"**: The Bitcoin symbol at the exact center of our name represents hard, unconfiscatable, mathematically limited bearer money.
- **"ente" / "bete"**: Anchors the concept of the African **Household, Family, and Home**.
- **The Core Axiom**: **"Hard Money for the African Household."**

### Brand Soul & Persona
- **Role**: Liberator, Guardian of Household Wealth, Direct Enabler of Sovereign Trade.
- **Voice**: Dignified, Calm, Direct, Authoritative, Free of Crypto Speculation Hype.
- **Tone**: Concise and action-focused. We never speak in confusing jargon to people who just want to send food, rent, or trade money to their family across the border.

---

## 2. Dynamic Palette Engine & Developer Experience

Ye₿ente features an extensible theme engine located in [`src/theme/brandKit.ts`](file:///Users/mac/yebente/src/theme/brandKit.ts) and [`src/theme/ThemeContext.tsx`](file:///Users/mac/yebente/src/theme/ThemeContext.tsx).

### How Any Developer Defines a New Palette (in 5 Lines)

Any engineer or designer can define and register a new palette by appending an entry to `PALETTES` in [`src/theme/brandKit.ts`](file:///Users/mac/yebente/src/theme/brandKit.ts):

```typescript
export const PALETTES: Record<string, BrandPalette> = {
  // Existing palettes...
  myCustomTheme: {
    id: 'myCustomTheme',
    name: 'My Custom Theme',
    tagline: 'High contrast neon on slate',
    tokens: {
      bgRoot: '#0B0D13',
      bgNav: '#10141D',
      bgSurface: '#171C28',
      bgInput: '#0E1119',
      bgTabActive: '#222B3D',
      bgButtonNeutral: '#19202E',
      borderSubtle: '#29344A',
      borderModal: '#32405B',
      borderInteractive: '#3C4D6D',
      accentPrimary: '#6366F1',
      accentPrimaryHover: '#818CF8',
      accentSecondary: '#EC4899',
      accentSecondaryHover: '#F472B6',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      textDisabled: '#475569',
      statusSuccess: '#34D399',
      statusError: '#F87171',
    },
  },
};
```

When registered:
1. It automatically populates the **Theme Palette** selector in [`WalletSettingsModal.tsx`](file:///Users/mac/yebente/src/components/WalletSettingsModal.tsx).
2. It propagates CSS variables (`--bg-root`, `--accent-primary`, etc.) onto `document.documentElement`.
3. It persists user preference seamlessly via `localStorage`.

### Production Palettes

1. **Obsidian Plum** (`obsidianPlum`) [Default]:
   - Royal Violet (`#763698`) and Warm Rose (`#946069`) on Deep Obsidian (`#120E16`). The canonical Stan Style palette.
2. **Solar Amber** (`solarAmber`):
   - Bitcoin Gold (`#D97706`) and Bronze (`#B45309`) on Deep Charcoal (`#0E0D0B`).
3. **Kigali Emerald** (`kigaliEmerald`):
   - Deep Jade (`#059669`) and Teal (`#0D9488`) on Dark Pine (`#09120E`). Resonates with African mobile money rails.
4. **Nile Slate** (`nileSlate`):
   - Cobalt (`#2563EB`) and Sky Blue (`#0284C7`) on Midnight Steel (`#0A0F17`). Designed for institutional treasury and B2B clearing.

---

## 3. Company Asset & Logo Guidelines

### The Wordmark: Ye₿ente

The Ye₿ente wordmark is composed of three distinct typographic components:
1. **"Ye"**: Rendered in `Banana Yeti` (`font-banana`) font, extra-bold weight, warm cream color (`#F8F0E7`).
2. **"₿"**: Bitcoin currency symbol rendered in `system-ui, -apple-system, sans-serif` font, heavy black weight, rosewood accent (`#D1B9B3`), with exact optical kerning `px-[0.5px]`.
3. **"ente"**: Rendered in `Banana Yeti` (`font-banana`) font, extra-bold weight, warm cream color (`#F8F0E7`).

```tsx
<div className="flex items-center tracking-tight leading-none select-none">
  <span className="font-banana font-black text-[26px] text-[#F8F0E7] drop-shadow-sm">
    Ye
  </span>
  <span
    className="font-black text-[25px] text-[#D1B9B3] px-[0.5px] leading-none inline-flex items-center justify-center font-sans"
    style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
  >
    ₿
  </span>
  <span className="font-banana font-black text-[26px] text-[#F8F0E7] drop-shadow-sm">
    ente
  </span>
</div>
```

### Prohibited Wordmark Usages
- Never replace the `₿` glyph with a Latin "b", dollar sign `$`, or emoji.
- Never apply decorative gradients or drop shadows larger than `drop-shadow-sm` to the logo.
- Never skew, rotate, or stretch the wordmark.
- Minimum clearspace around the wordmark is 16px on all sides.

---

## 4. Blueprint for Incorporating New Features

When extending Ye₿ente with features not yet implemented (such as P2P escrow, merchant till clearing, automated dollar-cost-averaging, or cross-border remittance orderbooks), developers must follow these standard component recipes.

### Feature Pattern A: Multi-Step Interactive Flow (e.g. Escrow or Cross-Border Swap)
1. **Header**:
   - Must use the textless `<ArrowLeft className="w-5 h-5" />` back button.
   - Symmetrical balance with centered title and an empty right spacer (`<div className="w-8" aria-hidden="true" />`).
   - Pressing back while on an error or processing step returns to the input step; pressing back on the input step closes the view.
2. **Category / Option Tabs**:
   - 2-column or 3-column clean text-only grid (`grid-cols-2 gap-2` or `grid-cols-3 gap-2`).
   - Selected state: `bg-[#2E203C] border-[#763698] text-[#F8F0E7]`.
   - Inactive state: `bg-[#140E1B] border-[#382B44] text-[#9B97A2]`.
   - Never embed icons inside tab selectors unless displaying a distinct entity brand logo.
3. **Numeric Inputs**:
   - Container: `relative w-full`.
   - Input: `w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]`.
   - Currency or Unit: Absolute positioned right: `absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]`.
4. **Summary & Readouts (Anti-Confusion Rule)**:
   - Available balances, conversion totals, and fees must **never** be rendered in card boxes with borders.
   - Must use clean typographic rows: `flex justify-between items-center px-1 text-xs font-mono`.
5. **Action Button (CTA)**:
   - `w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20`.
   - Action-only text (e.g. `"Create Escrow"`, `"Confirm Swap"`, `"Initiate Payout"`). Zero icons.

### Feature Pattern B: History & Audit Lists
- Every historical list view must follow the 3-point tuple layout:
  - Left column: Bold action title (`text-sm font-semibold text-[#F8F0E7]`) + Monospace timestamp (`text-[11px] font-mono text-[#9B97A2]`).
  - Right column: Signed numeric quantity (`text-sm font-bold font-mono text-[#F8F0E7]`), prefixed with `+` for credits or `-` for debits.
  - Zero secondary subtitles, zero hashes, zero trailing chevrons.

---

## 5. Editorial and Quality Standards

1. **Zero Emojis**: Emojis are strictly banned from UI labels, placeholders, notification toasts, code comments, and documentation.
2. **Zero Typographic Dashes**: Never use en-dashes or em-dashes. Use standard hyphens `-` or colons `:`.
3. **Monospace Number Standard**: Every number representing money, Sats, rates, timestamps, phone numbers, or identifiers must use `font-mono`.
4. **Tabular Numerals**: Dynamic values must use `tabular-nums` to prevent horizontal jitter during rapid balance recalculation.
