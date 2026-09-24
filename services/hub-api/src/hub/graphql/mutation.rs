use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::hub::{
    auth,
    clutch_node_client::{ChainInfo, ClutchNodeClient},
    configuration::AppConfig,
    graphql::types::{get_auth_user, parse_clt_amount, AuthGuard, AuthSignatureInput, TokenResponse},
    ratelimit::TokenRateLimiter,
    referrer::configured_referrer,
};
use async_graphql::{Context, Json, Object};
use serde_json::json;
use thiserror::Error;
use tracing::{error, info};

/// Fetches the chain_id cached at startup (see `main.rs`) from schema data.
fn require_chain_id(ctx: &Context<'_>) -> async_graphql::Result<u64> {
    ctx.data::<Arc<ChainInfo>>()
        .map(|c| c.chain_id)
        .map_err(|_| async_graphql::Error::new("Chain info not found"))
}

#[derive(Debug, Error)]
pub enum MutationError {
    #[error("Authentication failed: {0}")]
    AuthError(String),
    #[error("Internal server error: {0}")]
    InternalError(String),
    #[error("Invalid request: {0}")]
    InvalidRequest(String),
}

#[derive(Default)]
pub struct Mutation;

#[Object]
impl Mutation {
    /// Issue a JWT after verifying proof of key ownership: the caller must sign the canonical
    /// challenge `clutch-auth:{chain_id}:{publicKey}:{timestamp}` (see `hub::auth`) with the
    /// private key belonging to `public_key`. `timestamp` is unix seconds and must be within
    /// ±120s of server time.
    pub async fn generate_token(
        &self,
        ctx: &Context<'_>,
        public_key: String,
        timestamp: i64,
        signature: AuthSignatureInput,
    ) -> async_graphql::Result<TokenResponse> {
        let config = ctx
            .data::<AppConfig>()
            .map_err(|_| async_graphql::Error::new("Failed to get app config"))?;

        // FIRST, before any cryptography. This is the only mutation not behind `AuthGuard`, so
        // it is the only one that does signature recovery before it knows whether the caller is
        // anybody — which makes an unauthenticated flood of junk signatures a CPU amplifier.
        // A refusal here has to cost nothing, so nothing expensive may move above this.
        let limiter = ctx
            .data::<Arc<TokenRateLimiter>>()
            .map_err(|_| async_graphql::Error::new("Failed to get token rate limiter"))?;
        if let Err(limit) = limiter.check(&public_key) {
            info!("generateToken refused by rate limit ({:?}) for {}", limit, public_key);
            return Err(async_graphql::Error::new(limit.message()));
        }

        let chain_id = require_chain_id(ctx)?;

        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| async_graphql::Error::new("System time error"))?
            .as_secs() as i64;

        auth::verify_auth_challenge(
            chain_id,
            &public_key,
            timestamp,
            &signature.r,
            &signature.s,
            signature.v,
            now_secs,
        )
        .map_err(|e| {
            error!("generateToken proof-of-key-ownership failed for {}: {}", public_key, e);
            async_graphql::Error::new(format!("Proof of key ownership failed: {}", e))
        })?;

        let (token, expires_at) = auth::generate_jwt_token(
            &public_key,
            config.jwt_expiration_hours,
            config.jwt_secret.as_str(),
        )
        .map_err(|e| async_graphql::Error::new(format!("Failed to generate token: {}", e)))?;

        Ok(TokenResponse { token, expires_at })
    }

    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_request(
        &self,
        ctx: &Context<'_>,
        pickup_latitude: f64,
        pickup_longitude: f64,
        dropoff_latitude: f64,
        dropoff_longitude: f64,
        fare: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        // Get authenticated user from context
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let fare = parse_clt_amount(&fare)?;
        let chain_id = require_chain_id(ctx)?;

        let config = ctx
            .data::<AppConfig>()
            .map_err(|_| async_graphql::Error::new("Failed to get app config"))?;

        let resolved_referrer =
            configured_referrer(&config.default_ride_request_referrer);

        info!(
            "Processing ride request for user {} referrer={:?}",
            auth_user.public_key, resolved_referrer
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        // Get the next nonce for this user using the client method
        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        // Create request parameters
        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RideRequest",
                "arguments": {
                    "fare": fare,
                    "pickup_location": {
                        "latitude": pickup_latitude,
                        "longitude": pickup_longitude
                    },
                    "dropoff_location": {
                        "latitude": dropoff_latitude,
                        "longitude": dropoff_longitude
                    },
                    "referrer": resolved_referrer
                }
            }
        });

        Ok(Json(params))
    }

    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_offer(
        &self,
        ctx: &Context<'_>,
        ride_request_transaction_hash: String,
        fare: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let fare = parse_clt_amount(&fare)?;
        let chain_id = require_chain_id(ctx)?;

        let config = ctx
            .data::<AppConfig>()
            .map_err(|_| async_graphql::Error::new("Failed to get app config"))?;

        let resolved_referrer = configured_referrer(&config.default_ride_offer_referrer);

        info!(
            "Processing ride offer for user {} on request {} referrer={:?}",
            auth_user.public_key, ride_request_transaction_hash, resolved_referrer
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RideOffer",
                "arguments": {
                    "ride_request_transaction_hash": ride_request_transaction_hash,
                    "fare": fare,
                    "referrer": resolved_referrer
                }
            }
        });

        Ok(Json(params))
    }

    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_acceptance(
        &self,
        ctx: &Context<'_>,
        ride_offer_transaction_hash: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let chain_id = require_chain_id(ctx)?;

        info!(
            "Processing ride acceptance for passenger {} on offer {}",
            auth_user.public_key, ride_offer_transaction_hash
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RideAcceptance",
                "arguments": {
                    "ride_offer_transaction_hash": ride_offer_transaction_hash
                }
            }
        });

        Ok(Json(params))
    }

    /// Passenger pays the driver in one or more portions (RidePay). `fare` is this payment amount (CLT).
    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_pay(
        &self,
        ctx: &Context<'_>,
        ride_acceptance_transaction_hash: String,
        fare: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let fare = parse_clt_amount(&fare)?;
        if fare == 0 {
            return Err(async_graphql::Error::new("fare must be positive"));
        }
        let chain_id = require_chain_id(ctx)?;

        info!(
            "Processing ride pay for passenger {} on acceptance {}",
            auth_user.public_key, ride_acceptance_transaction_hash
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RidePay",
                "arguments": {
                    "ride_acceptance_transaction_hash": ride_acceptance_transaction_hash,
                    "fare": fare
                }
            }
        });

        Ok(Json(params))
    }

    /// Cancel an active ride. Either passenger or driver may cancel. Refunds unpaid fare to passenger.
    /// Cannot cancel if full fare has already been paid.
    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_cancel(
        &self,
        ctx: &Context<'_>,
        ride_acceptance_transaction_hash: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let chain_id = require_chain_id(ctx)?;

        info!(
            "Processing ride cancel for user {} on acceptance {}",
            auth_user.public_key, ride_acceptance_transaction_hash
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RideCancel",
                "arguments": {
                    "ride_acceptance_transaction_hash": ride_acceptance_transaction_hash
                }
            }
        });

        Ok(Json(params))
    }

    /// Cancel a pending ride request (before a driver accepts). Only the passenger who created the request can cancel.
    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_ride_request_cancel(
        &self,
        ctx: &Context<'_>,
        ride_request_transaction_hash: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let chain_id = require_chain_id(ctx)?;

        info!(
            "Processing ride request cancel for user {} on request {}",
            auth_user.public_key, ride_request_transaction_hash
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "RideRequestCancel",
                "arguments": {
                    "ride_request_transaction_hash": ride_request_transaction_hash
                }
            }
        });

        Ok(Json(params))
    }

    /// Burns `amount` CLT from the caller's balance, optionally tagged with a treasury
    /// `redemption_ref` (hex(keccak256(intent_id))). `redemption_ref: None` maps to the
    /// node's "no ref" convention (an empty string inside the transaction data) — the node
    /// itself is what treats an absent/empty ref as "not a redemption."
    #[graphql(guard = "AuthGuard")]
    pub async fn create_unsigned_burn(
        &self,
        ctx: &Context<'_>,
        amount: String,
        redemption_ref: Option<String>,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        let amount = parse_clt_amount(&amount)?;
        let chain_id = require_chain_id(ctx)?;

        info!(
            "Processing burn for user {} amount={} redemption_ref={:?}",
            auth_user.public_key, amount, redemption_ref
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        let nonce = client
            .get_next_nonce(&auth_user.public_key)
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to get nonce: {}", e)))?;

        // Amount stays a JSON string inside the blob too: the SDK re-parses it, so nothing
        // above 2^53 is ever rounded by a JS `Number` on the way through.
        let params = json!({
            "from": auth_user.public_key,
            "nonce": nonce,
            "chain_id": chain_id,
            "data": {
                "function_call_type": "Burn",
                "arguments": {
                    "amount": amount.to_string(),
                    "redemption_ref": redemption_ref
                }
            }
        });

        Ok(Json(params))
    }

    #[graphql(guard = "AuthGuard")]
    pub async fn send_raw_transaction(
        &self,
        ctx: &Context<'_>,
        raw_transaction: String,
    ) -> async_graphql::Result<Json<serde_json::Value>> {
        let auth_user = get_auth_user(ctx)
            .ok_or_else(|| async_graphql::Error::new("User not authenticated"))?;

        info!(
            "Submitting transaction for user with public key: {}",
            auth_user.public_key
        );

        let client = ctx
            .data::<Arc<ClutchNodeClient>>()
            .map_err(|_| async_graphql::Error::new("WebSocket manager not found"))?
            .clone();

        // Ensure the raw transaction is properly formatted (has 0x prefix)
        let formatted_tx = if !raw_transaction.starts_with("0x") {
            format!("0x{}", raw_transaction)
        } else {
            raw_transaction
        };

        // Send the transaction to the node
        // The client.send_request method will handle formatting the request properly
        let result = client
            .send_request("send_raw_transaction", serde_json::Value::String(formatted_tx))
            .await
            .map_err(|e| async_graphql::Error::new(format!("Failed to send transaction: {}", e)))?;

        // Return the result as JSON
        Ok(Json(result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hub::graphql::build_schema;

    fn test_config(token_rate_limit_per_minute: u32) -> AppConfig {
        AppConfig {
            log_level: "info".into(),
            serve_metric_addr: "127.0.0.1:0".into(),
            seq_url: String::new(),
            seq_api_key: String::new(),
            // Deliberately unreachable: generateToken never touches the node, and a test that
            // needed one would be testing something else.
            clutch_node_ws_url: "ws://127.0.0.1:1/ws".into(),
            ws_addr: "127.0.0.1:0".into(),
            jwt_secret: "iP8BoK3dJfTQGz5UyXq9NwL7e0vCmAhR6S2YxE1ZpDt4".into(),
            jwt_expiration_hours: 1,
            allowed_origins: "*".into(),
            default_ride_request_referrer: String::new(),
            default_ride_offer_referrer: String::new(),
            token_rate_limit_per_minute,
            token_rate_limit_global_per_minute: 1_000,
        }
    }

    fn test_chain_info() -> Arc<ChainInfo> {
        Arc::new(ChainInfo {
            chain_id: 2077,
            is_testnet: true,
            tx_fee: 1_000,
            total_supply: 0,
            mint_authority: "0x0000000000000000000000000000000000000000".into(),
        })
    }

    /// The limiter must run BEFORE `generateToken` verifies anything, which is the entire reason
    /// it exists: a refusal has to cost no signature recovery.
    ///
    /// Both calls below carry a junk signature, so the first gets as far as verification and
    /// fails there, while the second — already over the limit — must fail with the limiter's
    /// message instead. Comparing the two messages is what pins the ordering; asserting only
    /// that both failed would pass even if the limiter were never consulted.
    ///
    /// It also pins the sharing: the schema is cloned per request, so a limiter held by value
    /// would give each execution an empty map and enforce nothing, with every unit test in
    /// `ratelimit` still green.
    #[tokio::test]
    async fn generate_token_is_rate_limited_before_verifying_anything() {
        let schema = build_schema(
            ClutchNodeClient::new("ws://127.0.0.1:1/ws".to_string()),
            test_config(1),
            test_chain_info(),
        );

        let request = r#"mutation {
            generateToken(
                publicKey: "0x4196c526e2bb5dd02c2e2613b43291b0736afc47",
                timestamp: 1,
                signature: { r: "0x00", s: "0x00", v: 27 }
            ) { token expiresAt }
        }"#;

        let first = schema.execute(request).await;
        let second = schema.execute(request).await;

        let first_err = first
            .errors
            .first()
            .map(|e| e.message.clone())
            .expect("a junk signature must be rejected");
        let second_err = second
            .errors
            .first()
            .map(|e| e.message.clone())
            .expect("a request over the limit must be rejected");

        assert!(
            first_err.contains("Proof of key ownership failed"),
            "the first call must reach verification, got: {first_err}"
        );
        assert!(
            second_err.contains("Too many token requests"),
            "the second call must be refused by the limiter, got: {second_err}"
        );
    }
}
