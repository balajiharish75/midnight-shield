# MidnightShield — Privacy-Preserving Sealed-Bid Auction on Midnight Network

> **Midnight Network Hackathon** — Zero-knowledge sealed-bid (Vickrey/first-price) auctions with hidden bids, ZK solvency proofs, private reserves, anti-sniping & automatic refunds.

[![Compact](https://img.shields.io/badge/Compact-0.5.2-purple)](https://midnight.network)
[![Rust](https://img.shields.io/badge/Rust-1.8-orange)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Repo:** `balajiharish75/midnight-shield` (private) • **Branch:** `master` • **Contract:** `contracts/src/SealedBidAuction.compact` (5 circuits)

---

## Why MidnightShield?

Traditional NFT auctions leak everything — bid amounts, bidder wallets, reserve prices. Whales get targeted, sellers get sniped, privacy dies. MidnightShield fixes it:

- **Sealed bids** — on-chain only `hash(amount + salt + nft + deadline)` via `commit_bid` circuit
- **ZK solvency** — `I have ≥5000 DUST` without revealing balance (`zk_funds_proof`)
- **Private reserve** — seller commits `hash(reserve + salt)` → `verify_reserve` proves `winningBid ≥ reserve` without revealing reserve
- **Vickrey / First-price** — `settle_auction` computes winner + `second_highest_bid` in ZK; winner pays second price in Vickrey mode
- **Anti-sniping** — final-minute bid auto-extends deadline by 60s
- **Auto refunds** — `process_refunds` returns losing bids trustlessly

> See `demo/demo-script.md` for the 3-min pitch (private bids → ZK proof → anti-sniping → private reserve → Vickrey → refunds).

---

## Architecture

```
contracts/src/SealedBidAuction.compact  ← 5 ZK circuits (Compact 0.5.2, pragma >=0.16.0)
  ├── commit_bid / reveal_bid / verify_reserve / settle_auction / verify_auction + public_key
  └── Ledger: auction_state, nft_contract, seller, min_bid, reserve_commitment, bid_commitments Map<Bytes32,BidCommitment>

contracts/src/lib.rs  ← WASM shim (embeds compact via OUT_DIR/compact_source.rs)

sdk/src/               ← TypeScript SDK
  ├── index.ts         → MidnightAuctionSDK (createAuction / placeBid / revealBid / settleAuction / verifyAuction)
  └── circuits.ts      → AuctionCircuits wrappers

marketplace-fork/src/  ← React integration
  ├── hooks/useSealedBidAuction.ts
  └── components/SealedBidAuctionUI.tsx

demo/demo-script.md    ← 3-min demo script
HOW_TO_RUN.md          ← verified build & run instructions
```

**P0 Covered:** private sealed bids, ZK funds proof, commitment/reveal, winner verification, NFT+fund settlement  
**P1 Covered:** private reserve, auto refunds, anti-sniping, Vickrey/second-price

---

## Quick Start

### Prereqs

```bash
rustup target add wasm32-unknown-unknown wasm32-wasip1
cargo --version # rustc 1.8x
node --version  # v24.19
compact --version # 0.5.2 (/tmp/compact-repo/target/release/compact)
npm install -g typescript # 7.0.2
```

### 1. Compile Compact

```bash
/tmp/compact-repo/target/release/compact compile \
  contracts/src/SealedBidAuction.compact /tmp/compact-output
# Compiling 5 circuits: ✓
```

### 2. Build Contracts (Rust)

```bash
cd contracts
cargo build --release # native verify: Finished 0.04s ✓
# WASM needs wasi-sdk (Apple clang lacks wasip1):
cargo build --target wasm32-wasip1 --release
# workaround: midnight docker `midnight-hacknight/compact-builder`
```

`Cargo.toml` corrected: `blake3 1.8`, `borsh 1.8`, `midnight-circuits 7.2`, `midnight-zk-stdlib 2.3`

### 3. SDK

```bash
cd sdk
# @midnight-ntwrk/midnight-js-sdk is private — stub at src/types/midnight-js-sdk.d.ts + skipLibCheck
tsc --noEmit --project tsconfig.json # ✓ (fixed bucket + 1n)
# npm run build # once private registry configured -> dist/
```

Import: `import { MidnightAuctionSDK } from '@midnight-shield/auction-sdk'`

### 4. Marketplace Hook

```ts
import { createAuctionSDKHook } from './sdk/src/index';
import { useSealedBidAuction } from './marketplace-fork/src/hooks/useSealedBidAuction';
const sdk = await createMidnightAuctionSDK(rpcUrl, contractAddress);
const { auctionState, placeBid, revealBid, settleAuction } = useSealedBidAuction(sdk, auctionId);
```

### 5. Full Verify (CI)

```bash
/tmp/compact-repo/target/release/compact compile contracts/src/SealedBidAuction.compact /tmp/compact-output
cargo build --release
tsc --noEmit --project sdk/tsconfig.json
git status # working tree clean
```

> Full steps: [HOW_TO_RUN.md](./HOW_TO_RUN.md)

---

## Project Structure

```
midnight-shield/
├── contracts/
│   ├── src/SealedBidAuction.compact
│   ├── src/lib.rs
│   ├── Cargo.toml
│   └── build.rs
├── sdk/
│   ├── src/{index.ts,circuits.ts,types/midnight-js-sdk.d.ts}
│   ├── package.json
│   └── tsconfig.json
├── marketplace-fork/src/{hooks,components}
├── demo/demo-script.md
├── HOW_TO_RUN.md
└── README.md
```

---

## Security Notes

- **Salts never leave the client** — `storeBidSecret()` keeps `amount+salt` local for reveal; never share.
- `private midnight-js-sdk` — keep `src/types/midnight-js-sdk.d.ts` stub + `skipLibCheck:true` for local dev; configure real private registry for mainnet.
- `.gitignore` excludes `target/`, `dist/`, `node_modules/`, `.env`, `*.key`.

---

## License

MIT — see `LICENSE` • Built for Midnight Network • by `balajiharish75`
