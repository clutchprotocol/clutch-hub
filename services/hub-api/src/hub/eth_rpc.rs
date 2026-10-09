//! An Ethereum JSON-RPC face on the Clutch chain, at `POST /rpc`, so that MetaMask and Trust
//! Wallet can add Clutch as a network, show a person's CLT balance, and send CLT.
//!
//! clutch-node is not an EVM chain and speaks only its own WebSocket RPC. A wallet asks a network
//! a dozen Ethereum questions (which chain, which block, what balance); this answers them from the
//! node. It works because a wallet account and a Clutch account are the same key: the same 20
//! address bytes, so the address a person signs into the app with is the address the wallet asks
//! about.
//!
//! **Sending.** A wallet sends by signing a legacy Ethereum transaction. `eth_sendRawTransaction`
//! hands it to the node's `send_wallet_transaction` unchanged; the node checks the signature,
//! maps it to a transfer and stores it under its Ethereum hash (clutch-node `wallet_transfer.rs`),
//! so the hash the wallet shows is the hash `eth_getTransactionReceipt` answers for. Plain transfers
//! only: rides and payments stay in the app. A node that does not accept wallet transfers (an older
//! image, or one whose chain has not reached the switch-on block) refuses, and the wallet shows why.
//!
//! **Fees.** The chain charges a flat `tx_fee`. A wallet computes gas price x gas limit, so this
//! answers a gas limit of 21,000 and the smallest whole-gwei gas price whose product covers the fee.
//! A receipt reports the fee actually charged: gas used = `tx_fee`, at 10^12 wei each.
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

/// What a send answers when the node does not accept wallet transfers. A wallet shows this text.
pub const SEND_REFUSED: &str =
    "Sending from this wallet is not supported yet. Send CLT from the Clutch app.";

/// The gas a plain transfer uses on Ethereum, which is what wallets expect for one.
const TRANSFER_GAS: u64 = 21_000;

const GWEI: u128 = 1_000_000_000;

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
    /// Hands a signed wallet transaction (hex) to the node; the node's answer is the hash.
    async fn send_wallet_transaction(&self, raw_hex: &str) -> Result<String, String>;
    /// `{ transaction, block_index, block_hash }`, or None when the node does not know the hash.
    async fn transaction_by_hash(&self, hash: &str) -> Result<Option<Value>, String>;
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

    async fn send_wallet_transaction(&self, raw_hex: &str) -> Result<String, String> {
        let result = self
            .send_request("send_wallet_transaction", Value::String(raw_hex.to_string()))
            .await?;
        result
            .get("hash")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "node did not return a hash".to_string())
    }

    async fn transaction_by_hash(&self, hash: &str) -> Result<Option<Value>, String> {
        let found = self
            .send_request("get_transaction_by_hash", json!({ "hash": hash }))
            .await?;
        Ok(if found.is_object() { Some(found) } else { None })
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

fn hex_u128(n: u128) -> Value {
    Value::String(format!("0x{:x}", n))
}

/// What this hub tells wallets about the network: the id they sign with, and the flat fee.
#[derive(Clone, Copy, Debug)]
pub struct WalletNetwork {
    pub chain_id: u64,
    /// The node's `tx_fee`, in CLT base units.
    pub tx_fee: u64,
}

impl WalletNetwork {
    /// The smallest whole-gwei gas price at which `TRANSFER_GAS` covers the fee. Whole gwei
    /// keeps the product a whole number of CLT base units, so a wallet's "send max" amount still
    /// has 6 decimals.
    pub fn gas_price_wei(&self) -> u128 {
        let fee_wei = self.tx_fee as u128 * WEI_PER_BASE_UNIT;
        let per_gas = fee_wei.div_ceil(TRANSFER_GAS as u128);
        per_gas.div_ceil(GWEI) * GWEI
    }
}

/// A node hash or address string with `0x`, lower case.
fn with_0x(s: &str) -> String {
    format!("0x{}", s.trim_start_matches("0x").to_ascii_lowercase())
}

/// The node's answer for a wallet transfer as an Ethereum transaction and receipt. None for any
/// other kind of transaction: the wallet only ever asks about the ones it sent.
fn eth_transaction(found: &Value, tx_fee: u64) -> Option<(Value, Option<Value>)> {
    let tx = found.get("transaction")?;
    let data = tx.get("data")?;
    if data.get("function_call_type")?.as_str()? != "WalletTransfer" {
        return None;
    }
    let args = data.get("arguments")?;
    let hash = with_0x(tx.get("hash")?.as_str()?);
    let from = with_0x(tx.get("from")?.as_str()?);
    let to = with_0x(args.get("to")?.as_str()?);
    let value = args.get("value")?.as_u64()? as u128 * WEI_PER_BASE_UNIT;
    let gas_price = args.get("gas_price")?.as_u64()?;
    let gas_limit = args.get("gas_limit")?.as_u64()?;
    let wallet_chain_id = args.get("wallet_chain_id")?.as_u64()?;
    let nonce = tx.get("nonce")?.as_u64()?.checked_sub(1)?;
    let recovery = tx.get("signature_v")?.as_u64()?.checked_sub(27)?;
    let r = with_0x(tx.get("signature_r")?.as_str()?);
    let s = with_0x(tx.get("signature_s")?.as_str()?);
    let block_number = found.get("block_index").and_then(Value::as_u64);
    let block_hash = found
        .get("block_hash")
        .and_then(Value::as_str)
        .map(|h| to_hash(Some(&Value::String(h.to_string()))));

    let transaction = json!({
        "hash": hash,
        "type": "0x0",
        "nonce": hex_u64(nonce),
        "blockHash": block_hash,
        "blockNumber": block_number.map(hex_u64),
        "transactionIndex": block_number.map(|_| hex_u64(0)),
        "from": from,
        "to": to,
        "value": hex_u128(value),
        "gas": hex_u64(gas_limit),
        "gasPrice": hex_u64(gas_price),
        "input": "0x",
        "chainId": hex_u64(wallet_chain_id),
        "v": hex_u64(wallet_chain_id * 2 + 35 + recovery),
        "r": r,
        "s": s,
    });
    let receipt = block_number.map(|number| {
        json!({
            "transactionHash": hash,
            "transactionIndex": "0x0",
            "blockHash": block_hash,
            "blockNumber": hex_u64(number),
            "from": from,
            "to": to,
            "cumulativeGasUsed": hex_u64(tx_fee),
            "gasUsed": hex_u64(tx_fee),
            "effectiveGasPrice": hex_u128(WEI_PER_BASE_UNIT),
            "contractAddress": Value::Null,
            "logs": [],
            "logsBloom": format!("0x{}", "0".repeat(512)),
            "status": "0x1",
            "type": "0x0",
        })
    });
    Some((transaction, receipt))
}

/// A hex string param, `0x` and all, or invalid params.
fn hex_param(value: Option<&Value>) -> Result<String, RpcError> {
    let s = value
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("expected a hex string"))?;
    let hex = s
        .strip_prefix("0x")
        .ok_or_else(|| RpcError::invalid_params("expected a 0x hex string"))?;
    if hex.is_empty() || hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(RpcError::invalid_params("expected a 0x hex string"));
    }
    Ok(s.to_ascii_lowercase())
}

/// The node's refusal as a wallet should show it. An older node does not know the method at all.
fn send_error(e: String) -> RpcError {
    if e.contains("Method not found") {
        return RpcError::server(SEND_REFUSED);
    }
    let reason = e
        .strip_prefix("Failed to add transaction: ")
        .unwrap_or(&e)
        .trim_start_matches("Verification failed: ")
        .to_string();
    RpcError::server(reason)
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

/// Answers one method. `network.chain_id` is the id wallets see (see the module comment).
pub async fn dispatch<N: NodeReader>(
    node: &N,
    network: WalletNetwork,
    method: &str,
    params: &[Value],
) -> Result<Value, RpcError> {
    let wallet_chain_id = network.chain_id;
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
        "eth_gasPrice" => Ok(hex_u128(network.gas_price_wei())),
        "eth_maxPriorityFeePerGas" => Ok(hex_u64(0)),
        "eth_getCode" => Ok(Value::String("0x".to_string())),
        "eth_getLogs" => Ok(json!([])),
        "eth_getBlockByHash" => Ok(Value::Null),
        "eth_getTransactionByHash" | "eth_getTransactionReceipt" => {
            let hash = hex_param(params.first())?;
            let found = node.transaction_by_hash(&hash).await.map_err(node_err)?;
            let Some((transaction, receipt)) =
                found.as_ref().and_then(|f| eth_transaction(f, network.tx_fee))
            else {
                return Ok(Value::Null);
            };
            if method == "eth_getTransactionByHash" {
                Ok(transaction)
            } else {
                Ok(receipt.unwrap_or(Value::Null))
            }
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
        "eth_sendRawTransaction" => {
            let raw = hex_param(params.first())?;
            node.send_wallet_transaction(&raw).await.map(Value::String).map_err(send_error)
        }
        // The wallet holds the key; this server never signs.
        "eth_sendTransaction" => Err(RpcError::server(SEND_REFUSED)),
        "eth_estimateGas" => {
            let call = params.first().and_then(Value::as_object);
            let data = call
                .and_then(|c| c.get("data").or_else(|| c.get("input")))
                .and_then(Value::as_str)
                .unwrap_or("0x");
            if data != "0x" && !data.is_empty() {
                return Err(RpcError::server("This network has no contracts."));
            }
            Ok(hex_u64(TRANSFER_GAS))
        }
        "eth_call" => Err(RpcError::server("This network has no contracts.")),
        _ => Err(RpcError(-32601, format!("method {} is not supported", method))),
    }
}

fn error_response(id: Value, err: RpcError) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": err.0, "message": err.1 } })
}

/// One request object to one response object.
async fn handle_one<N: NodeReader>(node: &N, network: WalletNetwork, request: &Value) -> Value {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return error_response(id, RpcError(-32600, "invalid request".to_string()));
    };
    let params = match request.get("params") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.clone(),
        Some(_) => return error_response(id, RpcError::invalid_params("params must be an array")),
    };
    match dispatch(node, network, method, &params).await {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(err) => error_response(id, err),
    }
}

/// A request body (one request or a batch) to the response body.
pub async fn handle_body<N: NodeReader>(node: &N, network: WalletNetwork, body: &[u8]) -> Value {
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
                responses.push(handle_one(node, network, request).await);
            }
            Value::Array(responses)
        }
        request => handle_one(node, network, &request).await,
    }
}

/// `POST /rpc`. Always 200 with a JSON-RPC body, errors included, as JSON-RPC over HTTP expects.
pub async fn eth_rpc_handler(
    body: web::Bytes,
    node: web::Data<Arc<ClutchNodeClient>>,
    network: web::Data<WalletNetwork>,
) -> HttpResponse {
    let response = handle_body(node.get_ref().as_ref(), *network.get_ref(), &body).await;
    HttpResponse::Ok().json(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeNode;

    const ALICE: &str = "0x466e50fa1c0609744e0752a5b494511a5bb99006";
    const MINED: &str = "0x2d22fdda39f6c330d06e7520b51747b3a38b8ef2e07ea435ff36978dd25ec445";
    const PENDING: &str = "0x6220ad88e727d1d868fdc0cca46c7109a5025bd0c6cccc454ef0a32c0e80e068";
    const OTHER: &str = "0x00000000000000000000000000000000000000000000000000000000000000aa";
    const NET: WalletNetwork = WalletNetwork { chain_id: 20771, tx_fee: 1000 };

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
        async fn send_wallet_transaction(&self, raw_hex: &str) -> Result<String, String> {
            match raw_hex {
                "0xf86e" => Ok(MINED.to_string()),
                "0xdead" => Err("Method not found".to_string()),
                _ => Err("Failed to add transaction: Verification failed: insufficient balance for amount + fee. Required: 501000, available: 7".to_string()),
            }
        }
        async fn transaction_by_hash(&self, hash: &str) -> Result<Option<Value>, String> {
            let block = |i: Option<u64>| match i {
                Some(i) => (json!(i), json!("cd".repeat(32))),
                None => (Value::Null, Value::Null),
            };
            let (index, block_hash) = match hash {
                MINED => block(Some(300)),
                PENDING => block(None),
                OTHER => {
                    return Ok(Some(json!({
                        "transaction": { "hash": OTHER, "data": { "function_call_type": "RidePay", "arguments": {} } },
                        "block_index": 3, "block_hash": "ab",
                    })))
                }
                _ => return Ok(None),
            };
            Ok(Some(json!({
                "transaction": {
                    "from": ALICE,
                    "nonce": 5,
                    "chain_id": 2077,
                    "signature_r": "11".repeat(32),
                    "signature_s": "22".repeat(32),
                    "signature_v": 28,
                    "hash": hash,
                    "data": { "function_call_type": "WalletTransfer", "arguments": {
                        "to": "0x1111111111111111111111111111111111111111",
                        "value": 500_000, "gas_price": 48_000_000_000u64, "gas_limit": 21_000,
                        "wallet_chain_id": 20771,
                    }},
                },
                "block_index": index,
                "block_hash": block_hash,
            })))
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
        async fn send_wallet_transaction(&self, _: &str) -> Result<String, String> {
            Err("down".into())
        }
        async fn transaction_by_hash(&self, _: &str) -> Result<Option<Value>, String> {
            Err("down".into())
        }
    }

    async fn call(method: &str, params: Value) -> Result<Value, RpcError> {
        let params = params.as_array().cloned().unwrap_or_default();
        dispatch(&FakeNode, NET, method, &params).await
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
    async fn gas_price_covers_the_flat_fee_in_whole_gwei() {
        // $0.001 = 10^15 wei over 21,000 gas is 47.6 gwei: rounded up to 48.
        assert_eq!(NET.gas_price_wei(), 48_000_000_000);
        assert_eq!(call("eth_gasPrice", json!([])).await.unwrap(), json!("0xb2d05e000"));
        let fee = NET.gas_price_wei() * TRANSFER_GAS as u128;
        assert!(fee >= 1000 * WEI_PER_BASE_UNIT);
        assert_eq!(fee % WEI_PER_BASE_UNIT, 0, "send max stays at 6 decimals");
    }

    #[tokio::test]
    async fn estimate_gas_is_a_plain_transfer_and_refuses_data() {
        let plain = json!([{ "from": ALICE, "to": ALICE, "value": "0x1" }]);
        assert_eq!(call("eth_estimateGas", plain).await.unwrap(), json!("0x5208"));
        let empty = json!([{ "to": ALICE, "data": "0x" }]);
        assert_eq!(call("eth_estimateGas", empty).await.unwrap(), json!("0x5208"));
        let contract = json!([{ "to": ALICE, "data": "0xa9059cbb" }]);
        assert!(call("eth_estimateGas", contract).await.unwrap_err().1.contains("no contracts"));
    }

    #[tokio::test]
    async fn send_raw_returns_the_hash_and_explains_refusals() {
        assert_eq!(call("eth_sendRawTransaction", json!(["0xF86E"])).await.unwrap(), json!(MINED));
        let poor = call("eth_sendRawTransaction", json!(["0xbeef"])).await.unwrap_err();
        assert_eq!(poor.0, -32000);
        assert!(poor.1.starts_with("insufficient balance"), "{}", poor.1);
        // An older node does not know the method: the wallet is told to use the app.
        let old = call("eth_sendRawTransaction", json!(["0xdead"])).await.unwrap_err();
        assert_eq!(old, RpcError(-32000, SEND_REFUSED.to_string()));
        assert_eq!(call("eth_sendRawTransaction", json!(["f86e"])).await.unwrap_err().0, -32602);
        assert_eq!(call("eth_sendTransaction", json!([{}])).await.unwrap_err().1, SEND_REFUSED);
    }

    #[tokio::test]
    async fn a_mined_transfer_has_a_receipt_with_the_real_fee() {
        let receipt = call("eth_getTransactionReceipt", json!([MINED])).await.unwrap();
        assert_eq!(receipt["status"], json!("0x1"));
        assert_eq!(receipt["transactionHash"], json!(MINED));
        assert_eq!(receipt["blockNumber"], json!("0x12c"));
        assert_eq!(receipt["blockHash"], json!(format!("0x{}", "cd".repeat(32))));
        assert_eq!(receipt["from"], json!(ALICE));
        // gas used x price = 1000 base units = 10^15 wei, the fee charged.
        assert_eq!(receipt["gasUsed"], json!("0x3e8"));
        assert_eq!(receipt["effectiveGasPrice"], json!("0xe8d4a51000"));

        let tx = call("eth_getTransactionByHash", json!([MINED])).await.unwrap();
        assert_eq!(tx["nonce"], json!("0x4"), "the wallet's nonce, one below the node's");
        assert_eq!(tx["value"], json!("0x6f05b59d3b20000"), "0.5 at 18 decimals");
        assert_eq!(tx["v"], json!(format!("0x{:x}", 20771 * 2 + 36)));
        assert_eq!(tx["blockNumber"], json!("0x12c"));
    }

    #[tokio::test]
    async fn a_pending_transfer_has_no_receipt_yet() {
        assert_eq!(call("eth_getTransactionReceipt", json!([PENDING])).await.unwrap(), Value::Null);
        let tx = call("eth_getTransactionByHash", json!([PENDING])).await.unwrap();
        assert_eq!(tx["blockNumber"], Value::Null);
        assert_eq!(tx["hash"], json!(PENDING));
    }

    #[tokio::test]
    async fn unknown_and_app_transactions_are_null() {
        let unknown = format!("0x{}", "ee".repeat(32));
        assert_eq!(call("eth_getTransactionReceipt", json!([unknown])).await.unwrap(), Value::Null);
        assert_eq!(call("eth_getTransactionByHash", json!([OTHER])).await.unwrap(), Value::Null);
    }

    #[tokio::test]
    async fn unknown_method_is_method_not_found() {
        assert_eq!(call("debug_traceTransaction", json!([])).await.unwrap_err().0, -32601);
    }

    #[tokio::test]
    async fn a_down_node_is_an_error_not_a_zero() {
        let err = dispatch(&DownNode, WalletNetwork { chain_id: 1, tx_fee: 1000 }, "eth_getBalance", &[json!(ALICE)]).await.unwrap_err();
        assert_eq!(err.0, -32000);
        // The id still answers without the node, so a wallet can add the network while it is down.
        assert_eq!(dispatch(&DownNode, WalletNetwork { chain_id: 1, tx_fee: 1000 }, "eth_chainId", &[]).await.unwrap(), json!("0x1"));
    }

    #[tokio::test]
    async fn body_single_batch_and_errors() {
        let one = handle_body(&FakeNode, NET, br#"{"jsonrpc":"2.0","id":7,"method":"eth_chainId"}"#).await;
        assert_eq!(one, json!({"jsonrpc":"2.0","id":7,"result":"0x5123"}));

        let batch = handle_body(
            &FakeNode,
            NET,
            br#"[{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]},{"jsonrpc":"2.0","id":"b","method":"nope"}]"#,
        )
        .await;
        assert_eq!(batch[0]["result"], json!("0x12c"));
        assert_eq!(batch[1]["id"], json!("b"));
        assert_eq!(batch[1]["error"]["code"], json!(-32601));

        let parse = handle_body(&FakeNode, NET, b"{not json").await;
        assert_eq!(parse["error"]["code"], json!(-32700));

        let empty = handle_body(&FakeNode, NET, b"[]").await;
        assert_eq!(empty["error"]["code"], json!(-32600));

        let too_many = format!("[{}]", vec![r#"{"id":1,"method":"eth_chainId"}"#; MAX_BATCH + 1].join(","));
        let refused = handle_body(&FakeNode, NET, too_many.as_bytes()).await;
        assert_eq!(refused["error"]["code"], json!(-32600));

        let bad_params = handle_body(&FakeNode, NET, br#"{"id":1,"method":"eth_getBalance","params":{"a":1}}"#).await;
        assert_eq!(bad_params["error"]["code"], json!(-32602));
    }
}
