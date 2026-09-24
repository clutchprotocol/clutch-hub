use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct JSONRPCRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: String,
}

#[derive(Serialize, Deserialize)]
pub struct JSONRPCResponse {
    pub jsonrpc: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<JSONRPCError>,
    pub id: String,
}

#[derive(Serialize, Deserialize)]
pub struct JSONRPCError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}
