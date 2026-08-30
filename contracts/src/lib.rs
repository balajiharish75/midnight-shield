//! MidnightShield Auction Protocol - WASM bindings
//! Embeds SealedBidAuction.compact source for runtime use

use wasm_bindgen::prelude::*;

include!(concat!(env!("OUT_DIR"), "/compact_source.rs"));

#[wasm_bindgen]
pub fn get_compact_source() -> String {
    COMPACT_SOURCE.to_string()
}

#[wasm_bindgen]
pub fn get_contract_name() -> String {
    "SealedBidAuction".to_string()
}

// Re-export midnight primitives for WASM
pub use blake3;
pub use sha2;
pub use borsh;
pub use serde;
pub use serde_json;
