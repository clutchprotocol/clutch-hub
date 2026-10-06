use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::hub::signature_keys::SignatureKeys;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub pk: String, // public key
    pub exp: usize, // expiration time
}

/// Prefix of the canonical proof-of-key-ownership message signed by clients for `generateToken`.
pub const AUTH_CHALLENGE_PREFIX: &str = "clutch-auth";

/// Maximum allowed clock skew (seconds) between the client challenge timestamp and server time.
pub const AUTH_TIMESTAMP_WINDOW_SECS: i64 = 120;

/// Canonical auth challenge message. Must match clutch-hub-sdk-js `buildAuthChallengeMessage`
/// byte-for-byte: `clutch-auth:{chain_id}:{publicKey}:{timestamp}` where `chain_id` is this
/// hub's chain (see `main.rs`'s startup `get_chain_info` fetch), `publicKey` is the exact
/// string the client sends as the mutation argument, and `timestamp` is decimal unix seconds.
///
/// Breaking change from the pre-treasury format (`clutch-auth:{publicKey}:{timestamp}`, no
/// chain binding): without `chain_id` here, a challenge signed on testnet authenticates the
/// same key on any other Clutch hub within the clock-skew window — replay across chains. One
/// format, no fallback to the old string.
pub fn build_auth_challenge_message(chain_id: u64, public_key: &str, timestamp: i64) -> String {
    format!("{}:{}:{}:{}", AUTH_CHALLENGE_PREFIX, chain_id, public_key, timestamp)
}

/// Keccak-256 of the canonical auth message, as 64-char lowercase hex **without** `0x`.
/// Like transaction hashes, the secp256k1 signature is computed over
/// `Keccak256(hash_hex.as_utf8_bytes())` — i.e. over the UTF-8 bytes of this hex string —
/// matching the SDK's `signHash` / the node's verification convention.
pub fn auth_challenge_hash_hex(chain_id: u64, public_key: &str, timestamp: i64) -> String {
    let message = build_auth_challenge_message(chain_id, public_key, timestamp);
    let mut hasher = Keccak256::new();
    hasher.update(message.as_bytes());
    hex::encode(hasher.finalize())
}

/// Verify proof of key ownership for `generateToken`.
///
/// Two signatures are accepted. Each is checked against its own digest, so one cannot pass for
/// the other:
/// 1. a key that signed [`auth_challenge_hash_hex`] (the SDK with a local key);
/// 2. a wallet that signed the readable message from [`build_auth_challenge_message`] with
///    `personal_sign` (EIP-191). MetaMask and Trust Wallet will not sign a hash string, and the
///    user sees `clutch-auth:{chain_id}:{publicKey}:{timestamp}` in the wallet's prompt.
///
/// Rejects when:
/// - `public_key` is not a 40-char address / 130-char uncompressed public key,
/// - `timestamp` deviates more than [`AUTH_TIMESTAMP_WINDOW_SECS`] from `now_secs`, or
/// - neither recoverable signature `(r, s, v)` recovers to `public_key`.
pub fn verify_auth_challenge(
    chain_id: u64,
    public_key: &str,
    timestamp: i64,
    r: &str,
    s: &str,
    v: i32,
    now_secs: i64,
) -> Result<(), String> {
    SignatureKeys::validate_public_key(public_key)?;

    if (now_secs - timestamp).abs() > AUTH_TIMESTAMP_WINDOW_SECS {
        return Err(format!(
            "challenge timestamp is outside the allowed ±{}s window",
            AUTH_TIMESTAMP_WINDOW_SECS
        ));
    }

    let hash_hex = auth_challenge_hash_hex(chain_id, public_key, timestamp);
    let direct = SignatureKeys::verify_key_ownership(public_key, hash_hex.as_bytes(), r, s, v);
    if let Ok(true) = direct {
        return Ok(());
    }

    let message = build_auth_challenge_message(chain_id, public_key, timestamp);
    let wallet_bytes = SignatureKeys::personal_sign_bytes(message.as_bytes());
    if let Ok(true) = SignatureKeys::verify_key_ownership(public_key, &wallet_bytes, r, s, v) {
        return Ok(());
    }

    // Neither matched. A malformed signature keeps its own error; a well-formed one from the
    // wrong key is a mismatch.
    match direct {
        Ok(_) => Err("signature does not match the provided public key".to_string()),
        Err(e) => Err(format!("invalid challenge signature: {}", e)),
    }
}

pub fn generate_jwt_token(
    public_key: &str,
    expiration_hours: u64,
    jwt_secret: &str,
) -> Result<(String, usize), String> {
    SignatureKeys::validate_public_key(public_key)?;

    let expiration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
        + (expiration_hours * 3600) as usize;

    let claims = Claims {
        pk: public_key.to_string(),
        exp: expiration,
    };

    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| e.to_string())?;

    Ok((token, expiration))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_751_500_000;
    const CHAIN_ID: u64 = 2077;

    /// Sign the auth challenge exactly like the SDK does (recoverable secp256k1 over
    /// Keccak256 of the challenge-hash hex string's UTF-8 bytes).
    fn sign_challenge(secret_key: &str, chain_id: u64, public_key: &str, timestamp: i64) -> (String, String, i32) {
        let hash_hex = auth_challenge_hash_hex(chain_id, public_key, timestamp);
        SignatureKeys::sign(secret_key, hash_hex.as_bytes())
    }

    #[test]
    fn valid_challenge_with_address_passes() {
        let keys = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, &r, &s, v, NOW).is_ok());
    }

    #[test]
    fn valid_challenge_with_uncompressed_public_key_passes() {
        let keys = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.public_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.public_key, NOW, &r, &s, v, NOW).is_ok());
    }

    #[test]
    fn valid_challenge_with_prefixed_mixed_case_address_passes() {
        let keys = SignatureKeys::generate_new_keypair();
        // The message must be built from the exact string the client sends, so sign and
        // verify with the same (0x-prefixed, upper-cased) representation.
        let shouty = format!("0x{}", keys.address_key.trim_start_matches("0x").to_uppercase());
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &shouty, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &shouty, NOW, &r, &s, v, NOW).is_ok());
    }

    #[test]
    fn timestamp_within_window_passes() {
        let keys = SignatureKeys::generate_new_keypair();
        for skew in [-AUTH_TIMESTAMP_WINDOW_SECS, -60, 0, 60, AUTH_TIMESTAMP_WINDOW_SECS] {
            let ts = NOW + skew;
            let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, ts);
            assert!(
                verify_auth_challenge(CHAIN_ID, &keys.address_key, ts, &r, &s, v, NOW).is_ok(),
                "skew {}s should be accepted",
                skew
            );
        }
    }

    #[test]
    fn expired_or_future_timestamp_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        for skew in [-(AUTH_TIMESTAMP_WINDOW_SECS + 1), AUTH_TIMESTAMP_WINDOW_SECS + 1, -3600, 3600] {
            let ts = NOW + skew;
            let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, ts);
            let err = verify_auth_challenge(CHAIN_ID, &keys.address_key, ts, &r, &s, v, NOW).unwrap_err();
            assert!(err.contains("window"), "skew {}s should be rejected: {}", skew, err);
        }
    }

    #[test]
    fn signature_from_wrong_key_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        let attacker = SignatureKeys::generate_new_keypair();
        // Attacker signs the victim's challenge with their own key.
        let (r, s, v) = sign_challenge(&attacker.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, &r, &s, v, NOW).is_err());
    }

    #[test]
    fn tampered_message_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        // Signed for NOW, but presented with a different (still in-window) timestamp.
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW + 30, &r, &s, v, NOW).is_err());
        // Signed for one key, presented for another valid key.
        let other = SignatureKeys::generate_new_keypair();
        assert!(verify_auth_challenge(CHAIN_ID, &other.address_key, NOW, &r, &s, v, NOW).is_err());
    }

    #[test]
    fn signature_from_different_chain_fails() {
        // Closes the cross-hub replay path: a challenge signed for one chain_id must not
        // authenticate against another, even with an otherwise-identical key/timestamp.
        let keys = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID + 1, &keys.address_key, NOW, &r, &s, v, NOW).is_err());
    }

    #[test]
    fn garbage_signature_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, "zz", "zz", 27, NOW).is_err());
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, "aa", "bb", 27, NOW).is_err());
        let (r, s, _) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, &r, &s, 99, NOW).is_err());
    }

    #[test]
    fn invalid_public_key_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, "0x0", NOW, &r, &s, v, NOW).is_err());
        assert!(verify_auth_challenge(CHAIN_ID, "not-hex", NOW, &r, &s, v, NOW).is_err());
    }

    /// Fixtures regenerated for the chain-bound challenge format
    /// (`clutch-auth:{chain_id}:{publicKey}:{timestamp}`), produced by actually running the
    /// clutch-hub-sdk-js cryptographic primitives (`@noble/hashes` keccak_256 +
    /// `@noble/secp256k1` signAsync, the same code `authChallengeHashHex`/`signHashHex` in
    /// src/sdk.ts use) against the new message string, for private key
    /// d2c446110cfcecbdf05b2be528e72483de5b6f7ef9c7856df2f81f48e9f2748f.
    ///
    /// Regeneration note: as of this change, the SDK's own `buildAuthChallengeMessage` has NOT
    /// been updated to include `chain_id` yet (that's a separate SDK task) — it still emits the
    /// old two-field string. These fixtures were produced with a small standalone script that
    /// builds the new `clutch-auth:{chain_id}:{publicKey}:{timestamp}` message inline and feeds
    /// it through the SDK's exported `authChallengeHashHex`/`signHashHex`-equivalent primitives
    /// (Keccak-256 the message to a hex string, then secp256k1-sign the Keccak-256 of that hex
    /// string's UTF-8 bytes) using the SDK repo's installed `@noble/hashes`/`@noble/secp256k1`.
    /// This is genuine cross-language cryptographic output, not invented bytes — only the
    /// not-yet-updated message-building step was done inline instead of via the SDK's stale
    /// `buildAuthChallengeMessage`. Once the SDK gains a `chainId` parameter on
    /// `buildAuthChallengeMessage`/`signAuthChallenge`, re-derive these two fixtures by calling
    /// the SDK's own updated functions directly and confirm the values are unchanged (they
    /// should be, since the message string and signing algorithm are identical either way).
    #[test]
    fn sdk_generated_fixture_with_address_verifies() {
        let public_key = "0xdeb4cfb63db134698e1879ea24904df074726cc0";
        let timestamp: i64 = 1_751_500_000;
        assert_eq!(
            auth_challenge_hash_hex(CHAIN_ID, public_key, timestamp),
            "244fdef376fdbfaacfca2edb726e394ce7a840f5d6522de8702bb846bd9e9356"
        );
        let r = "0x980eb29326bb3a0676525ae44097afa459d62d4eeb21f4f0c22602e253dded92";
        let s = "0x4b0275b8ebb9d3daab1cd9083c90699741a6c9eae94a0096821809fd69c77f36";
        assert!(verify_auth_challenge(CHAIN_ID, public_key, timestamp, r, s, 27, timestamp).is_ok());
        // Same signature must not validate a different timestamp, key, or chain_id.
        assert!(verify_auth_challenge(CHAIN_ID, public_key, timestamp + 1, r, s, 27, timestamp).is_err());
        assert!(verify_auth_challenge(CHAIN_ID + 1, public_key, timestamp, r, s, 27, timestamp).is_err());
    }

    #[test]
    fn sdk_generated_fixture_with_uncompressed_public_key_verifies() {
        let public_key = "0x04a5ddc16b93f7e744fbab3c025cf99a0ef00113c6727353a3dff406fb4d136a06d73244619adc980818931da1b053462ef5af5e121cb5616be45325edd9b0be15";
        let timestamp: i64 = 1_751_500_000;
        assert_eq!(
            auth_challenge_hash_hex(CHAIN_ID, public_key, timestamp),
            "d01ad81fccd69c16c622519c0925af8735ee35b56393009c7058eb43f4680aef"
        );
        let r = "0xf99dbe7d7892bf97e6362e68b6aa935b48085dfb95070c1c8cc82cf6747f69b5";
        let s = "0x47153f33e48b124e1a24b873021d823f028858bf81e0128c9d30921904357094";
        assert!(verify_auth_challenge(CHAIN_ID, public_key, timestamp, r, s, 27, timestamp).is_ok());
    }

    /// Sign the challenge the way a wallet does: `personal_sign` over the readable message.
    fn sign_challenge_as_wallet(
        secret_key: &str,
        chain_id: u64,
        public_key: &str,
        timestamp: i64,
    ) -> (String, String, i32) {
        let message = build_auth_challenge_message(chain_id, public_key, timestamp);
        SignatureKeys::sign(secret_key, &SignatureKeys::personal_sign_bytes(message.as_bytes()))
    }

    #[test]
    fn wallet_signed_challenge_passes() {
        let keys = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge_as_wallet(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, &r, &s, v, NOW).is_ok());
    }

    #[test]
    fn wallet_signed_challenge_fails_for_another_chain_timestamp_or_key() {
        let keys = SignatureKeys::generate_new_keypair();
        let other = SignatureKeys::generate_new_keypair();
        let (r, s, v) = sign_challenge_as_wallet(&keys.secret_key, CHAIN_ID, &keys.address_key, NOW);

        // Signed for chain 2077: no other chain accepts it.
        assert!(verify_auth_challenge(CHAIN_ID + 1, &keys.address_key, NOW, &r, &s, v, NOW).is_err());
        // Signed for NOW, shown with a different, still in-window, timestamp.
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW + 30, &r, &s, v, NOW).is_err());
        // Signed for one key, shown for another.
        assert!(verify_auth_challenge(CHAIN_ID, &other.address_key, NOW, &r, &s, v, NOW).is_err());

        // Another key signs the challenge of the first one.
        let (r2, s2, v2) = sign_challenge_as_wallet(&other.secret_key, CHAIN_ID, &keys.address_key, NOW);
        assert!(verify_auth_challenge(CHAIN_ID, &keys.address_key, NOW, &r2, &s2, v2, NOW).is_err());
    }

    #[test]
    fn wallet_signed_challenge_outside_the_window_fails() {
        let keys = SignatureKeys::generate_new_keypair();
        for skew in [-(AUTH_TIMESTAMP_WINDOW_SECS + 1), AUTH_TIMESTAMP_WINDOW_SECS + 1] {
            let ts = NOW + skew;
            let (r, s, v) = sign_challenge_as_wallet(&keys.secret_key, CHAIN_ID, &keys.address_key, ts);
            let err = verify_auth_challenge(CHAIN_ID, &keys.address_key, ts, &r, &s, v, NOW).unwrap_err();
            assert!(err.contains("window"), "skew {}s should be rejected: {}", skew, err);
        }
    }

    /// Made by @noble/secp256k1 (what the SDK uses) with `personal_sign` over
    /// `clutch-auth:1000:0xdeb4cfb63db134698e1879ea24904df074726cc0:1751500000`, for the dev key
    /// d2c446110cfcecbdf05b2be528e72483de5b6f7ef9c7856df2f81f48e9f2748f. A different
    /// implementation of the same standard, so it shows that a wallet's signature verifies here.
    #[test]
    fn javascript_wallet_fixture_verifies() {
        let public_key = "0xdeb4cfb63db134698e1879ea24904df074726cc0";
        let timestamp: i64 = 1_751_500_000;
        assert_eq!(
            build_auth_challenge_message(1000, public_key, timestamp),
            "clutch-auth:1000:0xdeb4cfb63db134698e1879ea24904df074726cc0:1751500000"
        );
        let r = "0x816b7bceba6de8fdf488131628c271dac56a501a2e454491b267bc71e33f403c";
        let s = "0x32f9ed592547b9878df0a3fdbf00229ca9baf5c71a88fa667895fb5b45d57578";
        assert!(verify_auth_challenge(1000, public_key, timestamp, r, s, 28, timestamp).is_ok());
        // It is the signature for that chain and that time only.
        assert!(verify_auth_challenge(CHAIN_ID, public_key, timestamp, r, s, 28, timestamp).is_err());
        assert!(verify_auth_challenge(1000, public_key, timestamp + 1, r, s, 28, timestamp).is_err());
        // And the other recovery id gives another key.
        assert!(verify_auth_challenge(1000, public_key, timestamp, r, s, 27, timestamp).is_err());
    }

    #[test]
    fn challenge_message_format_is_stable() {
        assert_eq!(
            build_auth_challenge_message(CHAIN_ID, "0xdeb4cfb63db134698e1879ea24904df074726cc0", 1_751_500_000),
            "clutch-auth:2077:0xdeb4cfb63db134698e1879ea24904df074726cc0:1751500000"
        );
    }
}
