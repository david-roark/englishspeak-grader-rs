#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/6] Rust format check (cargo fmt --check)"
cargo fmt --manifest-path Cargo.toml --all -- --check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check

echo "==> [2/6] Rust Clippy (grader-core)"
cargo clippy --manifest-path Cargo.toml -p grader-core --all-targets -- -D warnings

echo "==> [3/6] Rust Clippy (src-tauri)"
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

echo "==> [4/6] Rust Tests (grader-core)"
cargo test --manifest-path Cargo.toml --workspace

echo "==> [5/6] Rust Tests (src-tauri)"
cargo test --manifest-path src-tauri/Cargo.toml

echo "==> [6/6] Frontend Typecheck, Lint, Tests & Build (ui)"
npm --prefix ui run check

echo "✅ All lint, format, typecheck, test, and build checks passed!"
