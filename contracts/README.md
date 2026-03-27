# AMINA Vault — Smart Contract

Solana program built with Anchor that handles on-chain vault operations, credential verification, and SAS attestation checks. Deployed on Devnet.

## Prerequisites

- **Rust** (install via [rustup](https://rustup.rs/))
- **Solana CLI** (v1.17+)
- **Anchor CLI** (v0.29.0)

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Install Solana CLI

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Install Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0
```

## Setup

```bash
# Configure Solana CLI for Devnet
solana config set --url devnet

# Create a deployer keypair (or use an existing one)
solana-keygen new -o /tmp/amina-deployer.json

# Fund the keypair with devnet SOL
solana airdrop 2 /tmp/amina-deployer.json
```

## Build

```bash
# Build the program
anchor build
```

The compiled program will be at `target/deploy/amina_vault.so`.

## Deploy

```bash
# Deploy to Devnet
anchor deploy --provider.cluster devnet --provider.wallet /tmp/amina-deployer.json
```

## Test

```bash
# Run tests
anchor test
```

## Program Instructions

The smart contract exposes the following instructions:

| Instruction | What It Does |
|-------------|-------------|
| `initialize` | Set up the program with admin authority and vault owner wallet |
| `register_sas_credential` | Register a SAS attestation for a client wallet |
| `verify_sas_attestation` | Verify that a wallet's SAS attestation is valid |
| `issue_credential` | Issue a new credential on-chain |
| `revoke_credential` | Revoke an existing credential |
| `create_vault` | Create a segregated vault for an institution |
| `attach_mandate` | Bind investment constraints to a vault |
| `deposit` | Accept funds from an approved source |
| `allocate_to_strategy` | Deploy capital to a yield strategy |
| `redeem` | Withdraw funds from the vault |
| `toggle_pause` | Pause or unpause vault operations |
| `unwind_strategy` | Exit a position and return funds to idle |

## Project Structure

```
contracts/
├── Anchor.toml                     # Anchor config (program ID, cluster, wallet)
├── Cargo.toml                      # Rust workspace config
├── programs/
│   └── amina-vault/
│       ├── Cargo.toml              # Program dependencies (anchor-lang, anchor-spl)
│       └── src/
│           └── lib.rs              # Program logic (all instructions)
├── tests/                          # Integration tests
└── target/
    └── deploy/
        └── amina_vault.so          # Compiled program binary
```

## Configuration

The `Anchor.toml` file defines:

```toml
[programs.devnet]
amina_vault = "5uPg5pi46gXErKcYWyqEAn2uSU68VZSUgvGTPZuVGwyA"

[provider]
cluster = "Devnet"
wallet = "/tmp/amina-deployer.json"
```

To deploy to a different cluster, update `cluster` and ensure your wallet has sufficient SOL.

## Troubleshooting

**Build fails with Rust errors:**
Make sure you have Rust 2021 edition support. Run `rustup update` to get the latest toolchain.

**Deploy fails with insufficient funds:**
Run `solana airdrop 2 /tmp/amina-deployer.json` to get Devnet SOL. You may need to retry if the faucet is rate-limited.

**Program ID mismatch:**
After the first deploy, Anchor generates a keypair at `target/deploy/amina_vault-keypair.json`. The program ID is derived from this keypair. Update `Anchor.toml` and `declare_id!()` in `lib.rs` if you need to redeploy with a new ID.
