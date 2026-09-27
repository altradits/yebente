# Ye₿ente Treasury & Corridor Operations Handbook

**The Liquidity Engine Behind Sovereign East African Settlement.**

The Ye₿ente Treasury and Operations team is responsible for maintaining unbroken settlement liquidity across all African currency corridors, safeguarding institutional reserves, and orchestrating algorithmic float rebalancing.

---

## 1. The Core Treasury Mandate

Our mandate is to ensure that a mother in Ethiopia receiving money from Kenya, or a merchant importing goods across the border, experiences **sub-15-second settlement with zero liquidity failures**.

To achieve this, the Treasury team manages three interconnected liquidity pools:
1. **Kenyan Shilling (KES) Float**: Maintained in Safaricom M-Pesa B2C settlement utility accounts and partner commercial bank trust accounts.
2. **Ethiopian Birr (ETB) Float**: Maintained in Ethio Telecom Telebirr super-agent merchant accounts.
3. **Lightning Network Channel Capacity (Sats)**: Dedicated inbound and outbound liquidity distributed across high-availability Lightning nodes.

---

## 2. Float Management & Algorithmic Rebalancing

### 2.1 The Float Imbalance Challenge
Cross-border payment flows between Kenya and Ethiopia are asymmetrical:
- Inflow from Kenya (remittances and retail trade purchases) typically exceeds immediate reverse flow.
- This creates excess KES accumulation in Nairobi while depleting ETB float in Addis Ababa.

### 2.2 Rebalancing Architecture
Treasury operates automated algorithmic rebalancing bots executing on a continuous cycle:

```
[Excess KES Float Accumulation in Kenya]
                  │
                  ▼
[Automated Local Settlement via Bank Partner]
                  │
                  ▼
[Liquidate KES into Bitcoin Sats via Liquidity Partner]
                  │
                  ▼
[Route Sats across Lightning to Rebalance Nodes]
                  │
                  ▼
[Settle Sats to Replenish ETB Float with Ethiopian Super-Agent]
```

### 2.3 Strict Float Exposure Caps
To protect against fiat currency devaluation:
- **Maximum Unhedged Fiat Exposure**: No corridor may hold more than $50,000 equivalent in unhedged local fiat float overnight.
- **Auto-Hedging Rule**: Any excess fiat float exceeding operating thresholds is automatically converted into Bitcoin Sats or dollar-pegged reserves within 15 minutes of receipt.
- **Devaluation Safeguard**: In light of the National Bank of Ethiopia's floating exchange rate, ETB float is strictly kept to a rolling 4-hour projected disbursement volume.

---

## 3. Institutional Multi-Signature Custody

Company capital, operating reserves, and cold storage assets are governed by cryptographic multi-signature protocols:

1. **3-of-5 Multi-Sig Standard**:
   - Outbound treasury movements from cold storage require signatures from at least 3 of 5 authorized keyholders.
   - Keys are held on hardware security modules (HSMs) and physically distributed across distinct geographic jurisdictions (Nairobi, Addis Ababa, and international trust locations).
2. **Zero Single-Key Access**:
   - No individual, including the founders or executive leadership, has unilateral access to corporate reserves.
3. **Hot Wallet Limits**:
   - Operating hot wallets connected to automated Lightning nodes hold no more than 72 hours of projected corridor volume. Excess capital automatically sweeps to cold storage.

---

## 4. Emergency Circuit Breakers & Incident Response

### 4.1 Automated Velocity Limits
The platform enforces automated velocity circuit breakers:
- If corridor disbursement volume exceeds 300% of rolling 15-minute moving averages, automated payouts are temporarily held for secondary review.
- If a single recipient phone number receives more than 3 consecutive high-value transfers within 10 minutes, the account enters compliance verification.

### 4.2 Incident Response Matrix
- **Tier 1 (Telecom Gateway Timeout)**: Automatic failover to status polling; user notified of pending verification window.
- **Tier 2 (Channel Liquidity Depletion)**: Automated submarine swap triggered to inject Sats from hot reserve.
- **Tier 3 (Corridor Float Depletion)**: Immediate notification to Treasury desk; secondary partner routing engaged.
