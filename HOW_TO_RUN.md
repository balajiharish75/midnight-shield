# MidnightShield — How to Run

> Privacy-Preserving Sealed-Bid Auction on Midnight Network — verified at `66c5417` (`/Users/harish/midnight-shield/`)

Contract compiles (5 circuits), native Rust verifies, SDK `tsc` passes. `wasm32-wasip1` requires `wasi-sdk` (Apple clang 17 lacks `wasip1` sysroot) — native `cargo build --release` is the local verifier.

---

## 0. Prereqs

```bash
rustup target add wasm32-unknown-unknown wasm32-wasip1
cargo --version          # rustc 1.8x
node --version           # v24.19, npm 11.17
# Compact toolchain:
compact --version        # 0.5.2  (/tmp/compact-repo/target/release/compact)
npm install -g typescript # 7.0.2 (sdk devDep 5.0 stubbed)
```

---

## 1. Compact — SealedBidAuction (5 circuits)

```bash
/tmp/compact-repo/target/release/compact compile \
  /Users/harish/midnight-shield/contracts/src/SealedBidAuction.compact \
  /tmp/compact-output
# expect: Compiling 5 circuits:  (EXIT 0)
# artifacts: /tmp/compact-output/{contract,keys,zkir,compiler}
```

Key fixes: `pragma language_version >=0.16.0`, `disclose()` on all witness params to ledger `Map.insert`/`lookup`, `assert(!auction_settled, "…")` 2-arg, `default<Bytes<32>>`, `AuctionState` enum, immutable `updated_bid` reconstruction.

---

## 2. Contracts — Rust Shim

`contracts/src/lib.rs` embeds compact via `build.rs` → `OUT_DIR/compact_source.rs`

```bash
cd /Users/harish/midnight-shield/contracts
# Corrected Cargo.toml: blake3 1.8 (was 1.5), borsh 1.8 (was 1.2),
# midnight-circuits 7.2 (was 7), midnight-zk-stdlib 2.3 (was 2)
# Removed invalid lib path src/SealedBidAuction.compact

cargo build --release
# -> Finished release [optimized] 0.04s  EXIT 0  ✓ API fixed

# WASM (needs wasi-sdk):
cargo build --target wasm32-wasip1 --release
# -> blst: error: unable to create target wasm32-unknown-wasip1  (environment, not code)
# workaround on CI: install wasi-sdk + llvm-wasm or use midnight docker: midnight-hacknight/compact-builder
```

---

## 3. SDK — `@midnight-shield/auction-sdk`

```bash
cd /Users/harish/midnight-shield/sdk
# private @midnight-ntwrk/midnight-js-sdk@^0.3.0 is 404 on public npm — stubbed:
#   src/types/midnight-js-sdk.d.ts
# tsconfig.json: module:NodeNext + moduleResolution:NodeNext (TS 7) + skipLibCheck
cat tsconfig.json
tsc --noEmit --project tsconfig.json
# -> EXIT 0 (fixed bigint bug: bucket + 1 -> bucket + 1n at src/index.ts:465)

# build (once private dep available):
# npm install  # 404 until midnight private registry configured
# npm run build  # tsc && tsc -m ESNext --outDir dist/esm -> dist/
```

SDK entry: `src/index.ts` → `MidnightAuctionSDK` (`createAuction` / `placeBid` / `revealBid` / `settleAuction` / `verifyAuction` / `onAuctionSettled`), circuits in `src/circuits.ts`.

---

## 4. Marketplace Fork — React Hook + UI

```bash
ls marketplace-fork/src/{hooks/useSealedBidAuction.ts,components/SealedBidAuctionUI.tsx}
# hook: useSealedBidAuction(sdk, auctionId) → {auctionState, placeBid, revealBid, settleAuction, ...}
# import via createAuctionSDKHook().initialize(rpcUrl, contractAddress)
```

---

## 5. Demo — 3-min Walkthrough

```bash
cat demo/demo-script.md
# 0:00 private sealed bids → 0:45 ZK funds proof → 1:15 anti-sniping (60s extend)
# → 1:45 private reserve + Vickrey → 2:15 auto refunds → 2:45 close
```

---

## 6. Full Verify (CI)

```bash
/tmp/compact-repo/target/release/compact compile contracts/src/SealedBidAuction.compact /tmp/compact-output
cargo build --release
tsc --noEmit --project sdk/tsconfig.json
git status # On branch master, working tree clean
```

> **Note:** `midnight-js-sdk` is private. Keep stub + `skipLibCheck:true` for local dev. For real network: configure Midnight private registry + `midnightRpcUrl` + deployed `contractAddress` from `createAuction`.
