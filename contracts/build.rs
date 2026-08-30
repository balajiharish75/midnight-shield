// build.rs - WASM compilation for Midnight Compact contract
use std::env;
use std::path::PathBuf;

fn main() {
    // Tell cargo to re-run if the Compact source changes
    println!("cargo:rerun-if-changed=src/SealedBidAuction.compact");

    // Set up WASM target
    let target = env::var("TARGET").unwrap_or_default();
    if target.contains("wasm32") {
        println!("cargo:rustc-link-arg=--import-memory");
        println!("cargo:rustc-link-arg=--export=__heap_base");
        println!("cargo:rustc-link-arg=--export=__data_end");
        println!("cargo:rustc-link-arg=--max-memory=67108864"); // 64MB
    }

    // Embed the Compact source as a string for runtime compilation
    let compact_source = std::fs::read_to_string("src/SealedBidAuction.compact")
        .expect("Failed to read Compact source");

    // Write embedded source for runtime access
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let escaped = compact_source.replace("\"", "\\\"").replace("###", "# # #");
    let output = format!("pub const COMPACT_SOURCE: &str = r###\"{}\"###;", escaped);
    std::fs::write(out_dir.join("compact_source.rs"), output).expect("Failed to write embedded source");
}