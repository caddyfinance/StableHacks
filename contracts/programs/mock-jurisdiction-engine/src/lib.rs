use anchor_lang::prelude::*;

declare_id!("HhPHx1RgzA99brCGprSg5VwJ8ZRgeXkLADbDRUox3Cq6");

#[program]
pub mod mock_jurisdiction_engine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, JurisdictionError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.total_jurisdictions = 0;
        config.initialized = true;

        Ok(())
    }

    pub fn register_jurisdiction(
        ctx: Context<RegisterJurisdiction>,
        code: String,
        regulator_name: String,
        license_name: String,
        travel_rule_threshold: u64,
        consent_required_above: u64,
        reporting_currency: String,
        max_leverage_allowed: bool,
        aml_screening_required: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_jurisdictions = config.total_jurisdictions.checked_add(1).unwrap();

        let rules = &mut ctx.accounts.rules;
        rules.code = code.clone();
        rules.regulator_name = regulator_name.clone();
        rules.license_name = license_name;
        rules.travel_rule_threshold = travel_rule_threshold;
        rules.consent_required_above = consent_required_above;
        rules.reporting_currency = reporting_currency;
        rules.max_leverage_allowed = max_leverage_allowed;
        rules.aml_screening_required = aml_screening_required;
        rules.active = true;

        emit!(JurisdictionRegistered {
            code,
            regulator_name,
            travel_rule_threshold,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn evaluate_compliance(
        ctx: Context<EvaluateCompliance>,
        attestation_id: String,
        vault_id: String,
        jurisdiction: String,
        operation_type: String,
        amount: u64,
    ) -> Result<()> {
        let rules = &ctx.accounts.rules;
        require!(rules.active, JurisdictionError::JurisdictionInactive);

        let mut rules_applied = Vec::new();
        let mut result = ComplianceResult::Passed;

        if rules.aml_screening_required {
            rules_applied.push("aml_screening");
        }

        if amount > rules.consent_required_above {
            rules_applied.push("consent_required");
            result = ComplianceResult::ReviewRequired;
        }

        let travel_rule_status = if amount >= rules.travel_rule_threshold {
            rules_applied.push("travel_rule_check");
            "compliant".to_string()
        } else {
            "exempt".to_string()
        };

        if operation_type == "ALLOCATE" && !rules.max_leverage_allowed {
            rules_applied.push("leverage_ban");
        }

        let rules_str = rules_applied.join(",");

        let attestation = &mut ctx.accounts.attestation;
        attestation.attestation_id = attestation_id.clone();
        attestation.vault_id = vault_id.clone();
        attestation.jurisdiction = jurisdiction.clone();
        attestation.operation_type = operation_type.clone();
        attestation.amount = amount;
        attestation.rules_applied = rules_str;
        attestation.travel_rule_status = travel_rule_status;
        attestation.result = result;
        attestation.attested_at = Clock::get()?.unix_timestamp;

        emit!(ComplianceEvaluated {
            attestation_id,
            vault_id,
            jurisdiction,
            operation_type,
            result: attestation.result.clone(),
            timestamp: attestation.attested_at,
        });

        Ok(())
    }

    pub fn update_jurisdiction(
        ctx: Context<UpdateJurisdiction>,
        travel_rule_threshold: u64,
        consent_required_above: u64,
        reporting_currency: String,
        max_leverage_allowed: bool,
        aml_screening_required: bool,
    ) -> Result<()> {
        let rules = &mut ctx.accounts.rules;
        rules.travel_rule_threshold = travel_rule_threshold;
        rules.consent_required_above = consent_required_above;
        rules.reporting_currency = reporting_currency;
        rules.max_leverage_allowed = max_leverage_allowed;
        rules.aml_screening_required = aml_screening_required;

        Ok(())
    }

    pub fn deactivate_jurisdiction(ctx: Context<UpdateJurisdiction>) -> Result<()> {
        let rules = &mut ctx.accounts.rules;
        rules.active = false;
        Ok(())
    }
}

// ─── Account Structures ─────────────────────────────────────────

#[account]
pub struct JurisdictionEngineConfig {
    pub admin: Pubkey,
    pub total_jurisdictions: u64,
    pub initialized: bool,
}

#[account]
pub struct JurisdictionRules {
    pub code: String,
    pub regulator_name: String,
    pub license_name: String,
    pub travel_rule_threshold: u64,
    pub consent_required_above: u64,
    pub reporting_currency: String,
    pub max_leverage_allowed: bool,
    pub aml_screening_required: bool,
    pub active: bool,
}

#[account]
pub struct ComplianceAttestation {
    pub attestation_id: String,
    pub vault_id: String,
    pub jurisdiction: String,
    pub operation_type: String,
    pub amount: u64,
    pub rules_applied: String,
    pub travel_rule_status: String,
    pub result: ComplianceResult,
    pub attested_at: i64,
}

// ─── Enums ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ComplianceResult {
    Passed,
    Failed,
    ReviewRequired,
}

// ─── Instruction Contexts ───────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 1,
        seeds = [b"jurisdiction_config"],
        bump,
    )]
    pub config: Account<'info, JurisdictionEngineConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(code: String)]
pub struct RegisterJurisdiction<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+8) + (4+24) + (4+32) + 8 + 8 + (4+8) + 1 + 1 + 1 + 64,
        seeds = [b"jurisdiction", code.as_bytes()],
        bump,
    )]
    pub rules: Account<'info, JurisdictionRules>,
    #[account(mut, seeds = [b"jurisdiction_config"], bump)]
    pub config: Account<'info, JurisdictionEngineConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(attestation_id: String)]
pub struct EvaluateCompliance<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + (4+16) + (4+8) + (4+16) + 8 + (4+128) + (4+16) + 1 + 8 + 64,
        seeds = [b"compliance", attestation_id.as_bytes()],
        bump,
    )]
    pub attestation: Account<'info, ComplianceAttestation>,
    pub rules: Account<'info, JurisdictionRules>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateJurisdiction<'info> {
    #[account(mut)]
    pub rules: Account<'info, JurisdictionRules>,
    #[account(seeds = [b"jurisdiction_config"], bump)]
    pub config: Account<'info, JurisdictionEngineConfig>,
    #[account(constraint = authority.key() == config.admin @ JurisdictionError::Unauthorized)]
    pub authority: Signer<'info>,
}

// ─── Events ─────────────────────────────────────────────────────

#[event]
pub struct JurisdictionRegistered {
    pub code: String,
    pub regulator_name: String,
    pub travel_rule_threshold: u64,
    pub timestamp: i64,
}

#[event]
pub struct ComplianceEvaluated {
    pub attestation_id: String,
    pub vault_id: String,
    pub jurisdiction: String,
    pub operation_type: String,
    pub result: ComplianceResult,
    pub timestamp: i64,
}

// ─── Errors ─────────────────────────────────────────────────────

#[error_code]
pub enum JurisdictionError {
    #[msg("Jurisdiction engine already initialized")]
    AlreadyInitialized,
    #[msg("Jurisdiction is not active")]
    JurisdictionInactive,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}
