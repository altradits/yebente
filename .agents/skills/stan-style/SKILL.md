---
name: stan-style
description: >-
  Official design system and implementation manual for Stan Style: a minimalist, high-clarity,
  zero-clutter UI/UX design architecture crafted for Ye₿ente. Use whenever designing, refactoring,
  or building user interfaces, components, modals, buttons, balance displays, navigation bars, or
  transaction lists to enforce strict minimalism, typography harmony, textless back navigation,
  and anti-confusion readout patterns.
---

# Stan Style Design System Specification

Stan Style is the official minimalist design architecture for Ye₿ente. It is engineered for financial clarity, frictionless navigation, and zero cognitive clutter.

---

## 1. Core Principles

1. **Strictly Action-Driven Buttons**:
   - Buttons display *only* the essential verb and noun: "Buy Sats", "Sell Sats", "Send M-Pesa", "Send Telebirr", "Sats Balance", "Done", "Save Settings", "Disconnect", "Wipe Wallet".
   - Eliminate all promotional badges ("Instant", "Cash Out", "Safaricom", "Ethio Telecom").
   - Eliminate secondary subtitle text inside buttons ("From M-Pesa / Telebirr", "KES to Phone or Till").
   - Eliminate decorative icons inside action buttons and navbar buttons. The button contains only clean typographic text.

2. **Textless Back Navigation**:
   - Every modal and sub-page header features a back button that displays *strictly* `<ArrowLeft className="w-5 h-5" />` with zero accompanying text (e.g. no "Back" or "Close" label).
   - Layout symmetry: The left houses the `<ArrowLeft />` button (`p-1.5 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7]`), the center houses the clean title (`text-base font-bold text-[#F8F0E7]`), and the right houses an invisible spacer (`<div className="w-8" aria-hidden="true" />`).
   - Hierarchical back action: If the view is in an intermediate state (e.g., error screen or pending PIN), pressing back returns the user to the `input` step; if on the `input` step, it closes the view.

3. **Anti-Confusion Readout Rule (Zero Button-Like Boxes for Non-Interactive Data)**:
   - Elements that are NOT clickable buttons (such as Available Balance, Sats Preview / You Receive, Total Sats, Fee readouts, Vault Balance) MUST NEVER have button-like borders (`border rounded-2xl bg-[#140E1B] border-[#382B44]`) that confuse users into thinking they are clickable controls.
   - Non-interactive readouts are rendered exclusively as clean, borderless typographic rows (`flex justify-between items-center px-1 text-xs`).
   - Borders and filled background boxes are reserved strictly for interactive controls (input fields, selectable category tabs, and submit CTA buttons).

4. **Minimalist Balance Display**:
   - Eliminate glowing radial blur circles, animated pulses, and heavy multi-layer shadows.
   - The Sats amount is displayed prominently as a primary numeric value without the redundant word "Balance" above it, since the navbar button already identifies Sats Balance.
   - Regional currency displays (KES and ETB) sit side by side in a clean, non-button typographic grid without card borders.

5. **Minimalist Transaction History**:
   - Header is titled simply "History" (never "Transaction History" and without operations count subtitles).
   - Eliminate search input bars, filter dropdowns, filter chips, CSV export buttons, and duplicate expand/collapse text.
   - Each history row displays strictly 3 data points: Title (e.g. "Buy Sats"), relative timestamp, and signed amount (+5,000 Sats, -500 KES).
   - Omit truncated cryptographic hashes (`WSQ...`), secondary fiat subtitles, and chevron right icons from the list view.

6. **Content and Editorial Integrity**:
   - Zero emojis anywhere in code, UI text, markdown, or commit messages.
   - Zero em-dashes or en-dashes. Use standard hyphens `-` or colons `:`.
   - Zero mock or synthetic data. Every digit must originate from authentic on-chain indexers, WebLN, or verifiable transactions.

---

## 2. Design Tokens and Color Architecture

### Color Palette: Obsidian Plum

| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `bg-root` | `#120E16` | Root application background and backdrop overlays |
| `bg-nav` | `#16101D` | Navigation bar and sticky header surface (`/90 backdrop-blur-md`) |
| `bg-surface` | `#1D1627` | Modal cards and primary container surfaces |
| `bg-input` | `#140E1B` | Input fields and recessed elements |
| `bg-tab-active`| `#2E203C` | Active selectable category tab surface |
| `bg-button-muted`| `#231A2D` | Neutral / secondary button background |
| `border-subtle` | `#382B44` | Structural dividers and subtle container outlines |
| `border-modal` | `#3A2D47` | Outer modal boundary border |
| `border-interactive` | `#3C2E49` | Unfocused interactive controls border |
| `accent-primary` | `#763698` | Royal Purple / Violet: active tab border, focus rings, primary action |
| `accent-secondary` | `#946069` | Warm Rose / Muted Wine: secondary accent, sell actions |
| `text-primary` | `#F8F0E7` | Warm Cream: headings, input values, primary button text |
| `text-secondary` | `#D1B9B3` | Rosewood / Sand: currency units, labels, highlighted values |
| `text-muted` | `#9B97A2` | Slate Ash: labels, timestamps, metadata |
| `text-disabled` | `#554653` | Faint placeholders and disabled state outlines |
| `status-success` | `#34D399` | Emerald 400: verified status indicators |
| `status-error` | `#F87171` | Red 400: failure messages, wipe confirmations |

---

## 3. Typography Rules

- **Sans-Serif (`font-sans`)**:
  Default system stack (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Used for all headings, form labels, button action text, and descriptive notes.
- **Monospace (`font-mono`)**:
  Used for all numbers, financial balances, Sats quantities, fiat amounts, fee breakdowns, phone numbers, transaction reference codes, and timestamps.
- **Tabular Figures (`tabular-nums`)**:
  Applied to all dynamic numeric values and list quantities to ensure aligned, jitter-free layout updates.
- **Wordmark Only (`font-banana`)**:
  Used strictly and exclusively for the "Ye" and "ente" segments of the "Ye₿ente" logo wordmark. Never used for body text or UI controls.

---

## 4. Component Patterns

### Modal Header Pattern
```tsx
<div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]/60">
  <button
    type="button"
    onClick={handleBack}
    className="p-1.5 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
    aria-label="Back"
  >
    <ArrowLeft className="w-5 h-5" />
  </button>
  <h2 className="text-base font-bold text-[#F8F0E7]">{title}</h2>
  <div className="w-8" aria-hidden="true" />
</div>
```

### Non-Interactive Readout Pattern (Anti-Confusion)
```tsx
{/* Static informational readout: clean typography, no box, no border */}
<div className="flex justify-between items-center px-1 text-xs">
  <span className="text-[#9B97A2]">Available</span>
  <span className="font-mono font-semibold text-[#D1B9B3]">
    {availableSats.toLocaleString()} Sats
  </span>
</div>

{/* Summary breakdown: borderless typographic rows */}
<div className="space-y-1.5 px-1 font-mono text-xs">
  <div className="flex justify-between items-center">
    <span className="text-[#9B97A2]">Total Sats</span>
    <span className="font-bold text-[#F8F0E7]">
      {totalSats.toLocaleString()} Sats
    </span>
  </div>
  <div className="flex justify-between items-center text-[#9B97A2]">
    <span>Fee</span>
    <span>{fee} Sats</span>
  </div>
</div>
```

### Interactive Tab Selector Pattern
```tsx
<div className="grid grid-cols-2 gap-2">
  <button
    type="button"
    onClick={() => setMode('optionA')}
    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
      mode === 'optionA'
        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
    }`}
  >
    Option A
  </button>
  <button
    type="button"
    onClick={() => setMode('optionB')}
    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
      mode === 'optionB'
        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
    }`}
  >
    Option B
  </button>
</div>
```

### Primary Action CTA Button Pattern
```tsx
<button
  type="button"
  onClick={handleAction}
  disabled={isDisabled}
  className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
>
  {buttonLabel}
</button>
```

### Transaction History Row Pattern
```tsx
<div className="flex items-center justify-between py-3 px-1 border-b border-[#382B44]/40 last:border-b-0">
  <div>
    <p className="text-sm font-semibold text-[#F8F0E7]">{tx.title}</p>
    <p className="text-[11px] font-mono text-[#9B97A2]">{formatDate(tx.timestamp)}</p>
  </div>
  <div className="text-right font-mono text-sm font-bold text-[#F8F0E7]">
    {isIncoming ? '+' : '-'}{amount} {currency}
  </div>
</div>
```

---

## 5. Checklist for Future Implementations

- [ ] Does every button display strictly the direct user action without icons, subtitles, or badges?
- [ ] Does every modal header contain a textless `<ArrowLeft />` back button with a centered title and empty spacer?
- [ ] Are all non-interactive readouts free of card containers and button-like borders?
- [ ] Are financial numbers rendered in `font-mono` with `tabular-nums`?
- [ ] Is the interface completely free of emojis?
- [ ] Are punctuation marks strictly standard hyphens `-` or colons `:` (no en-dashes or em-dashes)?
- [ ] Does all displayed data originate from verifiable sources with zero simulation?
