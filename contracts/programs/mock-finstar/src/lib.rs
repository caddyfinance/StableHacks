use anchor_lang::prelude::*;

declare_id!("7jH9Lhe9Ny3a8LxUsS3BCSHoDKmQZz5Vpu1py4pemisF");

#[program]
pub mod mock_finstar {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        institution_name: String,
        hbl_partner_id: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, FinstarError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.institution_name = institution_name;
        config.hbl_partner_id = hbl_partner_id;
        config.total_entries = 0;
        config.initialized = true;
        config.deployed_at = Clock::get()?.unix_timestamp;

        emit!(FinstarInitialized {
            admin: config.admin,
            institution_name: config.institution_name.clone(),
            deployed_at: config.deployed_at,
        });

        Ok(())
    }

    pub fn record_book_back(
        ctx: Context<RecordBookBack>,
        entry_id: String,
        entry_type: GLEntryType,
        vault_id: String,
        amount: u64,
        currency: String,
        debit_account: String,
        credit_account: String,
        narrative: String,
        source_tx_signature: String,
        regulatory_tag: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_entries = config.total_entries.checked_add(1).unwrap();

        let entry = &mut ctx.accounts.gl_entry;
        entry.entry_id = entry_id.clone();
        entry.entry_type = entry_type;
        entry.vault_id = vault_id.clone();
        entry.amount = amount;
        entry.currency = currency;
        entry.debit_account = debit_account.clone();
        entry.credit_account = credit_account.clone();
        entry.narrative = narrative;
        entry.source_tx_signature = source_tx_signature;
        entry.regulatory_tag = regulatory_tag;
        entry.swift_ref = String::new();
        entry.status = GLEntryStatus::Pending;
        entry.posted_at = Clock::get()?.unix_timestamp;

        emit!(GLEntryRecorded {
            entry_id,
            vault_id,
            amount,
            debit_account,
            credit_account,
            timestamp: entry.posted_at,
        });

        Ok(())
    }

    pub fn post_entry(ctx: Context<UpdateEntry>) -> Result<()> {
        let entry = &mut ctx.accounts.gl_entry;
        require!(
            entry.status == GLEntryStatus::Pending,
            FinstarError::InvalidEntryStatus
        );
        entry.status = GLEntryStatus::Posted;
        let now = Clock::get()?.unix_timestamp;
        entry.posted_at = now;

        emit!(GLEntryPosted {
            entry_id: entry.entry_id.clone(),
            posted_at: now,
        });

        Ok(())
    }

    pub fn reverse_entry(ctx: Context<UpdateEntry>, reason: String) -> Result<()> {
        let entry = &mut ctx.accounts.gl_entry;
        require!(
            entry.status == GLEntryStatus::Posted,
            FinstarError::InvalidEntryStatus
        );
        entry.status = GLEntryStatus::Reversed;
        let now = Clock::get()?.unix_timestamp;

        emit!(GLEntryReversed {
            entry_id: entry.entry_id.clone(),
            reason,
            reversed_at: now,
        });

        Ok(())
    }

    pub fn generate_regulatory_report(
        ctx: Context<CreateReport>,
        report_id: String,
        report_type: String,
        jurisdiction: String,
        vault_id: String,
        data_hash: [u8; 32],
    ) -> Result<()> {
        let report = &mut ctx.accounts.report;
        report.report_id = report_id.clone();
        report.report_type = report_type.clone();
        report.jurisdiction = jurisdiction.clone();
        report.vault_id = vault_id;
        report.data_hash = data_hash;
        report.generated_at = Clock::get()?.unix_timestamp;
        report.submitted = false;

        emit!(RegulatoryReportFiled {
            report_id,
            report_type,
            jurisdiction,
            timestamp: report.generated_at,
        });

        Ok(())
    }

    pub fn generate_swift_reference(ctx: Context<UpdateEntry>, swift_ref: String) -> Result<()> {
        let entry = &mut ctx.accounts.gl_entry;
        entry.swift_ref = swift_ref.clone();

        emit!(SwiftReferenceAssigned {
            entry_id: entry.entry_id.clone(),
            swift_ref,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ─── Account Structures ─────────────────────────────────────────

#[account]
pub struct FinstarConfig {
    pub admin: Pubkey,
    pub institution_name: String,
    pub hbl_partner_id: String,
    pub total_entries: u64,
    pub initialized: bool,
    pub deployed_at: i64,
}

#[account]
pub struct GLEntry {
    pub entry_id: String,
    pub entry_type: GLEntryType,
    pub vault_id: String,
    pub amount: u64,
    pub currency: String,
    pub debit_account: String,
    pub credit_account: String,
    pub narrative: String,
    pub source_tx_signature: String,
    pub regulatory_tag: String,
    pub swift_ref: String,
    pub status: GLEntryStatus,
    pub posted_at: i64,
}

#[account]
pub struct RegulatoryReport {
    pub report_id: String,
    pub report_type: String,
    pub jurisdiction: String,
    pub vault_id: String,
    pub data_hash: [u8; 32],
    pub generated_at: i64,
    pub submitted: bool,
}

// ─── Enums ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GLEntryType {
    Deposit,
    Withdrawal,
    YieldAccrual,
    FeeDebit,
    StrategyAllocation,
    StrategyUnwind,
    Transfer,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GLEntryStatus {
    Pending,
    Posted,
    Reversed,
}

// ─── Instruction Contexts ───────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 32) + (4 + 16) + 8 + 1 + 8,
        seeds = [b"finstar_config"],
        bump,
    )]
    pub config: Account<'info, FinstarConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(entry_id: String)]
pub struct RecordBookBack<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + 1 + (4+16) + 8 + (4+8) + (4+16) + (4+16) + (4+64) + (4+88) + (4+8) + (4+16) + 1 + 8 + 64,
        seeds = [b"gl_entry", entry_id.as_bytes()],
        bump,
    )]
    pub gl_entry: Account<'info, GLEntry>,
    #[account(mut, seeds = [b"finstar_config"], bump)]
    pub config: Account<'info, FinstarConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEntry<'info> {
    #[account(mut)]
    pub gl_entry: Account<'info, GLEntry>,
    #[account(seeds = [b"finstar_config"], bump)]
    pub config: Account<'info, FinstarConfig>,
    #[account(constraint = authority.key() == config.admin @ FinstarError::Unauthorized)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(report_id: String)]
pub struct CreateReport<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + (4+16) + (4+8) + (4+16) + 32 + 8 + 1 + 64,
        seeds = [b"reg_report", report_id.as_bytes()],
        bump,
    )]
    pub report: Account<'info, RegulatoryReport>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Events ─────────────────────────────────────────────────────

#[event]
pub struct FinstarInitialized {
    pub admin: Pubkey,
    pub institution_name: String,
    pub deployed_at: i64,
}

#[event]
pub struct GLEntryRecorded {
    pub entry_id: String,
    pub vault_id: String,
    pub amount: u64,
    pub debit_account: String,
    pub credit_account: String,
    pub timestamp: i64,
}

#[event]
pub struct GLEntryPosted {
    pub entry_id: String,
    pub posted_at: i64,
}

#[event]
pub struct GLEntryReversed {
    pub entry_id: String,
    pub reason: String,
    pub reversed_at: i64,
}

#[event]
pub struct RegulatoryReportFiled {
    pub report_id: String,
    pub report_type: String,
    pub jurisdiction: String,
    pub timestamp: i64,
}

#[event]
pub struct SwiftReferenceAssigned {
    pub entry_id: String,
    pub swift_ref: String,
    pub timestamp: i64,
}

// ─── Errors ─────────────────────────────────────────────────────

#[error_code]
pub enum FinstarError {
    #[msg("Finstar instance already initialized")]
    AlreadyInitialized,
    #[msg("Invalid entry status for this operation")]
    InvalidEntryStatus,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}
