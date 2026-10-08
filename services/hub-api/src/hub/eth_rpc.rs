//! A read-only Ethereum JSON-RPC face on the Clutch chain, at `POST /rpc`, so that MetaMask and
//! Trust Wallet can add Clutch as a network and show a person's CLT balance.
//!
//! clutch-node is not an EVM chain and speaks only its own WebSocket RPC. A wallet asks a network
//! a dozen Ethereum questions (which chain, which block, what balance); this answers them from the
//! node. It works because a wallet account and a Clutch account are the same key: the same 20
//! address bytes, so the address a person signs into the app with is the address the wallet asks
//! about.
//!
//! What it does NOT do: send. A wallet signs Ethereum-format transactions, which the node rejects,
//! so `eth_sendRawTransaction` (and `eth_estimateGas`, which a wallet calls first) refuse with a
//! message that says to send from the Clutch app. Accepting them would be a consensus change.
//!
//! Two translations matter:
//! - **Decimals.** A wallet assumes 18 decimals for a network's coin; CLT has 6 (1 USD = 1,000,000
//!   base units). Balances are multiplied by 10^12, so 1 CLT-dollar shows as 1.
//! - **Chain id.** The wallet chain id is `wallet_chain_id` in config, not the node's `chain_id`:
//!   the node's ids (2077 testnet, 1000 mainnet) are already registered to other networks on
//!   chainlist, and a wallet would show their names. Nothing signs with this id, so it can differ.

use crate::hub::clutch_node_client::ClutchNodeClient;
use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use std::sync::Arc;

/// Base units (6 decimals) to the 18 decimals every wallet assumes for a network's coin.
const WEI_PER_BASE_UNIT: u128 = 1_000_000_000_000;

/// A batch larger than this is refused whole. Wallets batch a handful of calls at most.
const MAX_BATCH: usize = 20;

/// What `eth_sendRawTransaction` and `eth_estimateGas` answer. A wallet shows this text.
pub const SEND_REFUSED: &str =
    "Sending from this wallet is not supported yet. Send CLT from the Clutch app.";

const ZERO_HASH: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
/// Keccak-256 of the RLP of an empty list: the `sha3Uncles` of a block with no uncles.
const EMPTY_UNCLES_HASH: &str =
    "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347";

/// The node calls the gateway needs. A trait so the dispatcher can be tested without a node.
#[allow(async_fn_in_trait)]
pub trait NodeReader {
    async fn balance(&self, address: &str) -> Result<u64, String>;
    async fn next_nonce(&self, address: &str) -> Result<u64, String>;
    async fn latest_block_index(&self) -> Result<u64, String>;
    /// The node's block JSON, or None when there is no block at that height.
    async fn block_by_index(&self, index: u64) -> Result<Option<Value>, String>;
}

impl NodeReader for ClutchNodeClient {
    async fn balance(&self, address: &str) -> Result<u64, String> {
        self.get_account_balance(address).await
    }

    async fn next_nonce(&self, address: &str) -> Result<u64, String> {
        self.get_next_nonce(address).await
    }

    async fn latest_block_index(&self) -> Result<u64, String> {
        let info = self.send_request("get_chain_info", json!({})).await?;
        info.get("latest_block_index")
            .and_then(Value::as_u64)
            .ok_or_else(|| "node did not report latest_block_index".to_string())
    }

    async fn block_by_index(&self, index: u64) -> Result<Option<Value>, String> {
        let block = self
            .send_request("get_block_by_index", json!({ "index": index }))
            .await?;
        Ok(if block.is_object() { Some(block) } else { None })
    }
}

/// A JSON-RPC error: code and message.
#[derive(Debug, PartialEq)]
pub struct RpcError(pub i64, pub String);

impl RpcError {
    fn invalid_params(msg: &str) -> Self {
        RpcError(-32602, msg.to_string())
    }
    fn server(msg: impl Into<String>) -> Self {
        RpcError(-32000, msg.into())
    }
}

fn hex_u64(n: u64) -> Value {
    Value::String(format!("0x{:x}", n))
}

/// A 20-byte address as `0x` + 40 lower-case hex, the node's canonical form; anything else is None.
fn parse_address(value: Option<&Value>) -> Option<String> {
    let s = value?.as_str()?;
    let hex = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"))?;
    if hex.len() == 40 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(format!("0x{}", hex.to_ascii_lowercase()))
    } else {
        None
    }
}

/// A node hash (64 hex, with or without `0x`) as a wallet expects it; anything else is the zero hash
/// (the genesis block's parent, for one).
fn to_hash(value: Option<&Value>) -> String {
    let s = value.and_then(Value::as_str).unwrap_or("");
    let hex = s.strip_prefix("0x").unwrap_or(s);
    if hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("0x{}", hex.to_ascii_lowercase())
    } else {
        ZERO_HASH.to_string()
    }
}

/// A block tag or number. `None` for "latest" and its synonyms (this chain has no finality lag a
/// wallet could act on). An unreadable tag is an error.
fn parse_block_tag(value: Option<&Value>) -> Result<Option<u64>, RpcError> {
    match value.and_then(Value::as_str) {
        None | Some("latest") | Some("pending") | Some("safe") | Some("finalized") => Ok(None),
        Some("earliest") => Ok(Some(0)),
        Some(s) => {
            let hex = s
                .strip_prefix("0x")
                .ok_or_else(|| RpcError::invalid_params("invalid block number"))?;
            u64::from_str_radix(hex, 16)
                .map(Some)
                .map_err(|_| RpcError::invalid_params("invalid block number"))
        }
    }
}

/// The node's block as an Ethereum block. It carries no transactions (they are not Ethereum
/// transactions) and no `baseFeePerGas`, so a wallet treats the network as legacy-gas at price 0.
fn eth_block(block: &Value, index: u64) -> Value {
    let miner = parse_address(block.get("author")).unwrap_or_else(|| ZERO_ADDRESS.to_string());
    let timestamp = block.get("timestamp").and_then(Value::as_u64).unwrap_or(0);
    json!({
        "number": hex_u64(index),
        "hash": to_hash(block.get("hash")),
        "parentHash": to_hash(block.get("previous_hash")),
        "nonce": "0x0000000000000000",
        "sha3Uncles": EMPTY_UNCLES_HASH,
        "logsBloom": format!("0x{}", "0".repeat(512)),
        "transactionsRoot": ZERO_HASH,
        "stateRoot": ZERO_HASH,
        "receiptsRoot": ZERO_HASH,
        "miner": miner,
        "difficulty": "0x0",
        "totalDifficulty": "0x0",
        "extraData": "0x",
        "size": "0x0",
        "gasLimit": hex_u64(30_000_000),
        "gasUsed": "0x0",
        "timestamp": hex_u64(timestamp),
        "transactions": [],
        "uncles": [],
    })
}

/// Answers one method. `wallet_chain_id` is the id wallets see (see the module comment).
pub async fn dispatch<N: NodeReader>(
    node: &N,
    wallet_chain_id: u64,
    method: &str,
    params: &[Value],
) -> Result<Value, RpcError> {
    let node_err = |e: String| RpcError::server(format!("node unavailable: {}", e));
    match method {
        "eth_chainId" => Ok(hex_u64(wallet_chain_id)),
        "net_version" => Ok(Value::String(wallet_chain_id.to_string())),
        "web3_clientVersion" => Ok(Value::String(format!(
            "clutch-hub-api/{}",
            env!("CARGO_PKG_VERSION")
        ))),
        "net_listening" => Ok(Value::Bool(true)),
        "eth_syncing" => Ok(Value::Bool(false)),
        "eth_accounts" => Ok(json!([])),
        "eth_gasPrice" | "eth_maxPriorityFeePerGas" => Ok(hex_u64(0)),
        "eth_getCode" => Ok(Value::String("0x".to_string())),
        "eth_getLogs" => Ok(json!([])),
        "eth_getTransactionByHash" | "eth_getTransactionReceipt" | "eth_getBlockByHash" => {
            Ok(Value::Null)
        }
        "eth_blockNumber" => node.latest_block_index().await.map(hex_u64).map_err(node_err),
        "eth_getBalance" => {
            let address = parse_address(params.first())
                .ok_or_else(|| RpcError::invalid_params("expected a 0x address"))?;
            let balance = node.balance(&address).await.map_err(node_err)?;
            Ok(Value::String(format!(
                "0x{:x}",
                balance as u128 * WEI_PER_BASE_UNIT
            )))
        }
        "eth_getTransactionCount" => {
            let address = parse_address(params.first())
                .ok_or_else(|| RpcError::invalid_params("expected a 0x address"))?;
            // Clutch nonces start at 1, so the next nonce minus one is the number sent.
            let next = node.next_nonce(&address).await.map_err(node_err)?;
            Ok(hex_u64(next.saturating_sub(1)))
        }
        "eth_getBlockByNumber" => {
            let tag = parse_block_tag(params.first())?;
            let latest = node.latest_block_index().await.map_err(node_err)?;
            let index = tag.unwrap_or(latest);
            if index > latest {
                return Ok(Value::Null);
            }
            match node.block_by_index(index).await.map_err(node_err)? {
                Some(block) => Ok(eth_block(&block, index)),
                None => Ok(Value::Null),
            }
        }
        "eth_sendRawTransaction" | "eth_sendTransaction" | "eth_estimateGas" => {
            Err(RpcError::server(SEND_REFUSED))
        }
        "eth_call" => Err(RpcError::server("This network has no contracts.")),
        _ => Err(RpcError(-32601, format!("method {} is not supported", method))),
    }
}

fn error_response(id: Value, err: RpcError) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": err.0, "message": err.1 } })
}

/// One request object to one response object.
async fn handle_one<N: NodeReader>(node: &N, wallet_chain_id: u64, request: &Value) -> Value {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return error_response(id, RpcError(-32600, "invalid request".to_string()));
    };
    let params = match request.get("params") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.clone(),
        Some(_) => return error_response(id, RpcError::invalid_params("params must be an array")),
    };
    match dispatch(node, wallet_chain_id, method, &params).await {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(err) => error_response(id, err),
    }
}

/// A request body (one request or a batch) to the response body.
pub async fn handle_body<N: NodeReader>(node: &N, wallet_chain_id: u64, body: &[u8]) -> Value {
    let parsed: Value = match serde_json::from_slice(body) {
        Ok(v) => v,
        Err(_) => return error_response(Value::Null, RpcError(-32700, "parse error".to_string())),
    };
    match parsed {
        Value::Array(requests) => {
            if requests.is_empty() || requests.len() > MAX_BATCH {
                return error_response(
                    Value::Null,
                    RpcError(-32600, format!("a batch holds 1 to {} requests", MAX_BATCH)),
                );
            }
            let mut responses = Vec::with_capacity(requests.len());
            for request in &requests {
                responses.push(handle_one(node, wallet_chain_id, request).await);
            }
            Value::Array(responses)
        }
        request => handle_one(node, wallet_chain_id, &request).await,
    }
}

/// The wallet chain id this hub answers with.
#[derive(Clone, Copy)]
pub struct WalletChainId(pub u64);

/// `POST /rpc`. Always 200 with a JSON-RPC body, errors included, as JSON-RPC over HTTP expects.
pub async fn eth_rpc_handler(
    body: web::Bytes,
    node: web::Data<Arc<ClutchNodeClient>>,
    chain: web::Data<WalletChainId>,
) -> HttpResponse {
    let response = handle_body(node.get_ref().as_ref(), chain.0, &body).await;
    HttpResponse::Ok().json(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeNode;

    const ALICE: &str = "0x466e50fa1c0609744e0752a5b494511a5bb99006";

    impl NodeReader for FakeNode {
        async fn balance(&self, address: &str) -> Result<u64, String> {
            assert_eq!(address, ALICE, "the node is asked with the canonical lower-case form");
            Ok(25_500_000) // $25.50
        }
        async fn next_nonce(&self, _address: &str) -> Result<u64, String> {
            Ok(4)
        }
        async fn latest_block_index(&self) -> Result<u64, String> {
            Ok(300)
        }
        async fn block_by_index(&self, index: u64) -> Result<Option<Value>, String> {
            Ok(Some(json!({
                "index": index,
                "timestamp": 1_790_000_000u64,
                "previous_hash": "0",
                "author": "0x662c5f11ed534ae93f29ed5e02a928081056f5f9",
                "hash": "AB".repeat(32),
                "transactions": [],
            })))
        }
    }

    struct DownNode;

    impl NodeReader for DownNode {
        async fn balance(&self, _: &str) -> Result<u64, String> {
            Err("down".into())
        }
        async fn next_nonce(&self, _: &str) -> Result<u64, String> {
            Err("down".into())
        }
        async fn latest_block_index(&self) -> Result<u64, String> {
            Err("down".into())
        }
        async fn block_by_index(&self, _: u64) -> Result<Option<Value>, String> {
            Err("down".into())
        }
    }

    async fn call(method: &str, params: Value) -> Result<Value, RpcError> {
        let params = params.as_array().cloned().unwrap_or_default();
        dispatch(&FakeNode, 20771, method, &params).await
    }

    #[tokio::test]
    async fn chain_id_is_the_wallet_id_not_the_node_id() {
        assert_eq!(call("eth_chainId", json!([])).await.unwrap(), json!("0x5123"));
        assert_eq!(call("net_version", json!([])).await.unwrap(), json!("20771"));
    }

    #[tokio::test]
    async fn balance_is_scaled_to_18_decimals() {
        let upper = ALICE.to_uppercase().replace("0X", "0x");
        let got = call("eth_getBalance", json!([upper, "latest"])).await.unwrap();
        // 25.5 * 10^18
        let wei = u128::from_str_radix(got.as_str().unwrap().trim_start_matches("0x"), 16).unwrap();
        assert_eq!(wei, 25_500_000_000_000_000_000);
    }

    #[tokio::test]
    async fn the_largest_balance_does_not_overflow() {
        let wei = u64::MAX as u128 * WEI_PER_BASE_UNIT;
        assert!(wei / WEI_PER_BASE_UNIT == u64::MAX as u128);
    }

    #[tokio::test]
    async fn a_bad_address_is_invalid_params() {
        for bad in [json!(["0x1234"]), json!([]), json!([42]), json!(["466e50fa1c0609744e0752a5b494511a5bb99006"])] {
            assert_eq!(call("eth_getBalance", bad).await.unwrap_err().0, -32602);
        }
    }

    #[tokio::test]
    async fn transaction_count_is_next_nonce_minus_one() {
        assert_eq!(call("eth_getTransactionCount", json!([ALICE, "latest"])).await.unwrap(), json!("0x3"));
    }

    #[tokio::test]
    async fn block_number_and_block() {
        assert_eq!(call("eth_blockNumber", json!([])).await.unwrap(), json!("0x12c"));
        let block = call("eth_getBlockByNumber", json!(["latest", false])).await.unwrap();
        assert_eq!(block["number"], json!("0x12c"));
        assert_eq!(block["hash"], json!(format!("0x{}", "ab".repeat(32))));
        assert_eq!(block["parentHash"], json!(ZERO_HASH));
        assert_eq!(block["miner"], json!("0x662c5f11ed534ae93f29ed5e02a928081056f5f9"));
        assert_eq!(block["timestamp"], json!("0x6ab13b80"));
        assert!(block.get("baseFeePerGas").is_none(), "legacy gas: no base fee");
        let earliest = call("eth_getBlockByNumber", json!(["earliest", false])).await.unwrap();
        assert_eq!(earliest["number"], json!("0x0"));
        let future = call("eth_getBlockByNumber", json!(["0x12d", false])).await.unwrap();
        assert_eq!(future, Value::Null);
        assert_eq!(call("eth_getBlockByNumber", json!(["soon", false])).await.unwrap_err().0, -32602);
    }

    #[tokio::test]
    async fn sending_is_refused_with_words() {
        for method in ["eth_sendRawTransaction", "eth_sendTransaction", "eth_estimateGas"] {
            let err = call(method, json!(["0x00"])).await.unwrap_err();
            assert_eq!(err, RpcError(-32000, SEND_REFUSED.to_string()));
        }
    }

    #[tokio::test]
    async fn unknown_method_is_method_not_found() {
        assert_eq!(call("debug_traceTransaction", json!([])).await.unwrap_err().0, -32601);
    }

    #[tokio::test]
    async fn a_down_node_is_an_error_not_a_zero() {
        let err = dispatch(&DownNode, 1, "eth_getBalance", &[json!(ALICE)]).await.unwrap_err();
        assert_eq!(err.0, -32000);
        // The id still answers without the node, so a wallet can add the network while it is down.
        assert_eq!(dispatch(&DownNode, 1, "eth_chainId", &[]).await.unwrap(), json!("0x1"));
    }

    #[tokio::test]
    async fn body_single_batch_and_errors() {
        let one = handle_body(&FakeNode, 20771, br#"{"jsonrpc":"2.0","id":7,"method":"eth_chainId"}"#).await;
        assert_eq!(one, json!({"jsonrpc":"2.0","id":7,"result":"0x5123"}));

        let batch = handle_body(
            &FakeNode,
            20771,
            br#"[{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]},{"jsonrpc":"2.0","id":"b","method":"nope"}]"#,
        )
        .await;
        assert_eq!(batch[0]["result"], json!("0x12c"));
        assert_eq!(batch[1]["id"], json!("b"));
        assert_eq!(batch[1]["error"]["code"], json!(-32601));

        let parse = handle_body(&FakeNode, 20771, b"{not json").await;
        assert_eq!(parse["error"]["code"], json!(-32700));

        let empty = handle_body(&FakeNode, 20771, b"[]").await;
        assert_eq!(empty["error"]["code"], json!(-32600));

        let too_many = format!("[{}]", vec![r#"{"id":1,"method":"eth_chainId"}"#; MAX_BATCH + 1].join(","));
        let refused = handle_body(&FakeNode, 20771, too_many.as_bytes()).await;
        assert_eq!(refused["error"]["code"], json!(-32600));

        let bad_params = handle_body(&FakeNode, 20771, br#"{"id":1,"method":"eth_getBalance","params":{"a":1}}"#).await;
        assert_eq!(bad_params["error"]["code"], json!(-32602));
    }
}
