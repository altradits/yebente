# Stan Style Design Rules

Stan Style is the mandatory minimalist design standard for Ye₿ente. All UI components, pages, modals, and elements must adhere strictly to these rules.

## Rule 1: Textless Back Navigation
Every modal or secondary page header must feature a textless back button containing only the `<ArrowLeft className="w-5 h-5" />` icon (no accompanying "Back" or "Close" text). It must be balanced with a centered title and an invisible right spacer `<div className="w-8" aria-hidden="true" />`.

## Rule 2: Clean, Action-Only Buttons
Action buttons (including primary CTA buttons and navbar controls like "Sats Balance") must display only the exact, concise action needed by the user.
- No icons inside primary action buttons or navbar buttons.
- No decorative badges ("Instant", "Cash Out", "Safaricom", "Ethio Telecom").
- No subtitles ("From M-Pesa / Telebirr", "KES to Phone or Till").

## Rule 3: Anti-Confusion Non-Interactive Readouts
Non-interactive data (e.g. Available Balance, You Receive preview, Total Sats, Fee, Vault Balance) must NEVER have button-like borders (`border rounded-2xl bg-[#...]`) that could deceive users into tapping them.
- Render non-interactive readouts as clean, borderless typographic rows (`px-1 text-xs flex justify-between`).
- Reserve bordered boxes and filled backgrounds exclusively for real interactive controls (inputs, selectable tabs, CTA buttons).

## Rule 4: Minimalist Balance Display
- Do not add radial blur circles, pulse animations, or multi-layer glow shadows to balance cards.
- Display the Sats amount prominently as a clean number without the redundant word "Balance" above it (the navbar button already says "Sats Balance").
- Regional currency values (KES and ETB) must be rendered as clean typographic displays without button borders.

## Rule 5: Minimalist History
- Header must be titled "History" (never "Transaction History" and without operations count explanation).
- Omit search inputs, filter dropdowns, filter chips, CSV export buttons, and cryptographic hash substrings from the primary list.
- Each row contains strictly: Title, relative timestamp, and signed amount.

## Rule 6: Editorial & Data Integrity
- Zero emojis anywhere in code, markdown, comments, git commit messages, or user interfaces.
- Zero en-dashes or em-dashes (use standard hyphens `-` or colons `:`).
- Zero mock or simulated data: every digit must come from verifiable on-chain indexers, WebLN, or real completed transactions.
