use anchor_lang::prelude::*;

declare_id!("EokhQnmdSswBvj8VfnV5TBKVantJNqGHWv243L8e6sDv");

#[program]
pub mod mock_translation_layer {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        finstar_program: Pubkey,
        notabene_program: Pubkey,
        mesh_program: Pubkey,
        jurisdiction_program: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, TLError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.finstar_program = finstar_program;
        config.notabene_program = notabene_program;
        config.mesh_program = mesh_program;
        config.jurisdiction_program = jurisdiction_program;
        config.total_instructions = 0;
        config.initialized = true;

        emit!(TranslationLayerInitialized {
            admin: config.admin,
            finstar_program,
            notabene_program,
            mesh_program,
            jurisdiction_program,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Step 1: Accept an instruction and create InstructionLog PDA.
    pub fn submit_instruction(
        ctx: Context<SubmitInstruction>,
        instruction_id: String,
        instruction_type: InstructionType,
        vault_id: String,
        amount: u64,
        jurisdiction: String,
        strategy_id: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_instructions = config.total_instructions.checked_add(1).unwrap();

        let log = &mut ctx.accounts.instruction_log;
        log.instruction_id = instruction_id.clone();
        log.instruction_type = instruction_type;
        log.vault_id = vault_id.clone();
        log.initiator = ctx.accounts.authority.key();
        log.amount = amount;
        log.jurisdiction = jurisdiction;
        log.strategy_id = strategy_id;

        log.compliance_check_pda = Pubkey::default();
        log.travel_rule_check_pda = Pubkey::default();
        log.routing_decision_pda = Pubkey::default();
        log.vault_tx_signature = String::new();
        log.gl_entry_pda = Pubkey::default();

        log.status = PipelineStatus::Received;
        log.rejection_reason = String::new();
        log.received_at = Clock::get()?.unix_timestamp;
        log.completed_at = 0;

        emit!(InstructionReceived {
            instruction_id,
            vault_id,
            amount,
            timestamp: log.received_at,
        });

        Ok(())
    }

    /// Step 2a: Run compliance checks via CPI to jurisdiction engine and notabene.
    pub fn execute_compliance(
        ctx: Context<ExecuteCompliance>,
        attestation_id: String,
        check_id: String,
        originator_vasp: String,
        beneficiary_vasp: String,
        beneficiary_wallet: Pubkey,
        threshold: u64,
    ) -> Result<()> {
        let log = &mut ctx.accounts.instruction_log;
        require!(
            log.status == PipelineStatus::Received,
            TLError::InvalidPipelineState
        );

        // CPI → jurisdiction engine: evaluate_compliance
        let jurisdiction_accounts = mock_jurisdiction_engine::cpi::accounts::EvaluateCompliance {
            attestation: ctx.accounts.compliance_attestation.to_account_info(),
            rules: ctx.accounts.jurisdiction_rules.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let jurisdiction_ctx = CpiContext::new(
            ctx.accounts.jurisdiction_program.to_account_info(),
            jurisdiction_accounts,
        );
        let op_type = match log.instruction_type {
            InstructionType::Deposit => "DEPOSIT",
            InstructionType::Allocate => "ALLOCATE",
            InstructionType::Redeem => "REDEEM",
            InstructionType::Unwind => "UNWIND",
            InstructionType::Pause => "PAUSE",
            InstructionType::MandateUpdate => "MANDATE_UPDATE",
        };
        mock_jurisdiction_engine::cpi::evaluate_compliance(
            jurisdiction_ctx,
            attestation_id,
            log.vault_id.clone(),
            log.jurisdiction.clone(),
            op_type.to_string(),
            log.amount,
        )?;
        log.compliance_check_pda = ctx.accounts.compliance_attestation.key();

        // CPI → notabene: evaluate_transfer
        let notabene_accounts = mock_notabene::cpi::accounts::EvaluateTransfer {
            check: ctx.accounts.travel_rule_check.to_account_info(),
            config: ctx.accounts.notabene_config.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let notabene_ctx = CpiContext::new(
            ctx.accounts.notabene_program.to_account_info(),
            notabene_accounts,
        );
        mock_notabene::cpi::evaluate_transfer(
            notabene_ctx,
            check_id,
            originator_vasp,
            beneficiary_vasp,
            ctx.accounts.authority.key(),
            beneficiary_wallet,
            log.amount,
            "USDC".to_string(),
            log.jurisdiction.clone(),
            log.jurisdiction.clone(),
            threshold,
        )?;
        log.travel_rule_check_pda = ctx.accounts.travel_rule_check.key();

        log.status = PipelineStatus::ComplianceChecked;

        emit!(PipelineStepCompleted {
            instruction_id: log.instruction_id.clone(),
            step: "compliance".to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Step 2b: Execute venue routing and book-back via CPI to mesh and finstar.
    pub fn execute_action(
        ctx: Context<ExecuteAction>,
        routing_id: String,
        gl_entry_id: String,
        gl_entry_type: mock_finstar::GLEntryType,
        debit_account: String,
        credit_account: String,
        narrative: String,
        source_tx: String,
    ) -> Result<()> {
        let log = &mut ctx.accounts.instruction_log;
        require!(
            log.status == PipelineStatus::ComplianceChecked,
            TLError::InvalidPipelineState
        );

        // CPI → mesh: record_routing
        let mesh_accounts = mock_mesh::cpi::accounts::RecordRouting {
            routing: ctx.accounts.routing_decision.to_account_info(),
            config: ctx.accounts.mesh_config.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let mesh_ctx = CpiContext::new(
            ctx.accounts.mesh_program.to_account_info(),
            mesh_accounts,
        );
        mock_mesh::cpi::record_routing(
            mesh_ctx,
            routing_id,
            log.vault_id.clone(),
            log.strategy_id.clone(),
            "solstice-yield".to_string(),
            log.amount,
            true,
            "mandate_allowed".to_string(),
            source_tx.clone(),
        )?;
        log.routing_decision_pda = ctx.accounts.routing_decision.key();
        log.status = PipelineStatus::RouteSelected;

        // CPI → finstar: record_book_back
        let finstar_accounts = mock_finstar::cpi::accounts::RecordBookBack {
            gl_entry: ctx.accounts.gl_entry.to_account_info(),
            config: ctx.accounts.finstar_config.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let finstar_ctx = CpiContext::new(
            ctx.accounts.finstar_program.to_account_info(),
            finstar_accounts,
        );
        mock_finstar::cpi::record_book_back(
            finstar_ctx,
            gl_entry_id,
            gl_entry_type,
            log.vault_id.clone(),
            log.amount,
            "USDC".to_string(),
            debit_account,
            credit_account,
            narrative,
            source_tx,
            log.jurisdiction.clone(),
        )?;
        log.gl_entry_pda = ctx.accounts.gl_entry.key();
        log.vault_tx_signature = log.instruction_id.clone();
        log.status = PipelineStatus::Complete;
        log.completed_at = Clock::get()?.unix_timestamp;

        emit!(PipelineComplete {
            instruction_id: log.instruction_id.clone(),
            gl_entry_pda: log.gl_entry_pda,
            compliance_pda: log.compliance_check_pda,
            timestamp: log.completed_at,
        });

        Ok(())
    }
}

// ─── Account Structures ─────────────────────────────────────────

#[account]
pub struct TranslationLayerConfig {
    pub admin: Pubkey,
    pub finstar_program: Pubkey,
    pub notabene_program: Pubkey,
    pub mesh_program: Pubkey,
    pub jurisdiction_program: Pubkey,
    pub total_instructions: u64,
    pub initialized: bool,
}

#[account]
pub struct InstructionLog {
    pub instruction_id: String,
    pub instruction_type: InstructionType,
    pub vault_id: String,
    pub initiator: Pubkey,
    pub amount: u64,
    pub jurisdiction: String,
    pub strategy_id: String,

    pub compliance_check_pda: Pubkey,
    pub travel_rule_check_pda: Pubkey,
    pub routing_decision_pda: Pubkey,
    pub vault_tx_signature: String,
    pub gl_entry_pda: Pubkey,

    pub status: PipelineStatus,
    pub rejection_reason: String,
    pub received_at: i64,
    pub completed_at: i64,
}

// ─── Enums ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum InstructionType {
    Deposit,
    Allocate,
    Redeem,
    Unwind,
    Pause,
    MandateUpdate,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PipelineStatus {
    Received,
    ComplianceChecked,
    RouteSelected,
    Executed,
    BookedBack,
    Complete,
    Rejected,
}

// ─── Instruction Contexts ───────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 1,
        seeds = [b"tl_config"],
        bump,
    )]
    pub config: Account<'info, TranslationLayerConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(instruction_id: String)]
pub struct SubmitInstruction<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + 1 + (4+16) + 32 + 8 + (4+8) + (4+24) + 32 + 32 + 32 + (4+88) + 32 + 1 + (4+64) + 8 + 8 + 128,
        seeds = [b"instruction", instruction_id.as_bytes()],
        bump,
    )]
    pub instruction_log: Account<'info, InstructionLog>,
    #[account(mut, seeds = [b"tl_config"], bump)]
    pub config: Account<'info, TranslationLayerConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteCompliance<'info> {
    #[account(mut)]
    pub instruction_log: Account<'info, InstructionLog>,

    // Jurisdiction engine CPI accounts
    /// CHECK: Initialized by CPI to jurisdiction engine
    #[account(mut)]
    pub compliance_attestation: AccountInfo<'info>,
    pub jurisdiction_rules: Account<'info, mock_jurisdiction_engine::JurisdictionRules>,
    /// CHECK: Jurisdiction engine program
    pub jurisdiction_program: AccountInfo<'info>,

    // Notabene CPI accounts
    /// CHECK: Initialized by CPI to notabene
    #[account(mut)]
    pub travel_rule_check: AccountInfo<'info>,
    #[account(mut)]
    pub notabene_config: Account<'info, mock_notabene::NotabeneConfig>,
    /// CHECK: Notabene program
    pub notabene_program: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteAction<'info> {
    #[account(mut)]
    pub instruction_log: Account<'info, InstructionLog>,

    // Mesh CPI accounts
    /// CHECK: Initialized by CPI to mesh
    #[account(mut)]
    pub routing_decision: AccountInfo<'info>,
    #[account(mut)]
    pub mesh_config: Account<'info, mock_mesh::MeshConfig>,
    /// CHECK: Mesh program
    pub mesh_program: AccountInfo<'info>,

    // Finstar CPI accounts
    /// CHECK: Initialized by CPI to finstar
    #[account(mut)]
    pub gl_entry: AccountInfo<'info>,
    #[account(mut)]
    pub finstar_config: Account<'info, mock_finstar::FinstarConfig>,
    /// CHECK: Finstar program
    pub finstar_program: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Events ─────────────────────────────────────────────────────

#[event]
pub struct TranslationLayerInitialized {
    pub admin: Pubkey,
    pub finstar_program: Pubkey,
    pub notabene_program: Pubkey,
    pub mesh_program: Pubkey,
    pub jurisdiction_program: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct InstructionReceived {
    pub instruction_id: String,
    pub vault_id: String,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PipelineStepCompleted {
    pub instruction_id: String,
    pub step: String,
    pub timestamp: i64,
}

#[event]
pub struct PipelineComplete {
    pub instruction_id: String,
    pub gl_entry_pda: Pubkey,
    pub compliance_pda: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PipelineRejected {
    pub instruction_id: String,
    pub reason: String,
    pub step: String,
    pub timestamp: i64,
}

// ─── Errors ─────────────────────────────────────────────────────

#[error_code]
pub enum TLError {
    #[msg("Translation layer already initialized")]
    AlreadyInitialized,
    #[msg("Invalid pipeline state for this operation")]
    InvalidPipelineState,
    #[msg("Compliance check failed")]
    ComplianceFailed,
}
