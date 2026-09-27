# Ye₿ente Product & Community Handbook

**Radical Simplicity for Everyday Africans.**

The Ye₿ente Product and Community team represents the front line of our movement. We design interfaces, educate local merchants, and onboard households across East Africa. Our standard is simple: a grandmother in rural Kenya or a young merchant in Addis Ababa should be able to send, receive, and protect their money with zero confusion and zero intimidation.

---

## 1. Product Philosophy: The Dignity of Simplicity

We do not design for Silicon Valley technologists or crypto speculators. We design for:
- The livestock trader in Moyale moving cattle across the border.
- The mother in Nairobi sending school fees to relatives in Ethiopia.
- The shopkeeper in Merkato (Addis Ababa) importing solar lights from Kenya.

### The Three Sacred Product Rules
1. **Never Speak in Cryptographic Jargon**:
   - Never show terms like "UTXO", "mempool", "hash preimage", "BOLT invoice", or "channel liquidity" on a user screen.
   - Speak exclusively in terms of real human actions: **"Buy Sats"**, **"Sell Sats"**, **"Send M-Pesa"**, **"Send Telebirr"**.
2. **Respect User Attention (Stan Style)**:
   - Eliminate every element that does not directly serve the immediate action.
   - If an element is informative (like Available Balance or Fees), it must never be styled like a clickable button.
3. **Speed Is Trust**:
   - When a user sends money, the transaction must confirm in under 15 seconds. Feedback must be instantaneous and clear.

---

## 2. Stan Style Design Execution

All product designers and frontend contributors must strictly enforce the [Stan Style Specification](.agents/skills/stan-style/SKILL.md):

1. **Textless Back Navigation**:
   - Modal headers always feature the textless `<ArrowLeft className="w-5 h-5" />` back button. No "Back" text, no "Close" text, zero clutter.
2. **Action-Only Buttons**:
   - The primary button states only the essential verb and noun.
   - No icons inside buttons, no marketing badges ("Instant", "Cash Out"), no promotional subtitles.
3. **Anti-Confusion Readouts**:
   - Static figures (Available balance, total cost, fees) must be plain typographic lines without box borders. Borders and button cards are reserved exclusively for real clickable controls.

---

## 3. Field Operations & Merchant Onboarding

### 3.1 The Merchant Value Proposition
When onboarding cross-border merchants:
- **Zero Chargeback Risk**: Bitcoin Sats and mobile money disbursements are final and irreversible.
- **Immediate Settlement**: No 3-day bank clearing delays.
- **Fee Reduction**: Merchants save 75% to 85% compared to commercial wire transfers or credit card payment processors.

### 3.2 Explaining Ye₿ente to Everyday Users
- **The Concept**: Ye₿ente (*Ye-Bete*) means **"Money for the Home"**. It is a direct digital pipeline connecting your phone directly to your family's phone across the border.
- **The Asset**: Bitcoin Satoshis (Sats) are digital hard money that cannot be debased or frozen. When you send KES or ETB, Ye₿ente uses Sats to jump the border instantly, arriving as local money on the other side.
