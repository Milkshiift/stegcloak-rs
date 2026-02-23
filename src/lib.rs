mod compact;
mod encrypt;
mod message;
mod util;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use wasm_bindgen::prelude::*;

use crate::util::StegError;

#[wasm_bindgen]
pub struct StegCloak {
    key_cache: Arc<Mutex<HashMap<Vec<u8>, [u8; encrypt::KEY_LENGTH]>>>,
}

#[wasm_bindgen]
impl StegCloak {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            key_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[wasm_bindgen]
    pub fn zwc() -> js_sys::Array {
        let arr = js_sys::Array::new_with_length(8);
        let mut buf = [0; 4];

        for (i, &c) in message::ZWC.iter().enumerate() {
            arr.set(i as u32, JsValue::from_str(c.encode_utf8(&mut buf)));
        }
        arr
    }

    #[wasm_bindgen]
    pub fn hide(
        &self,
        message: &str,
        password: &str,
        salt: &str,
        cover: &str,
    ) -> Result<String, JsValue> {
        validate_inputs(password, salt, Some(message), None)?;

        let key = get_or_derive_key(&self.key_cache, password, salt)?;
        let compressed = compact::compress(message.as_bytes())?;
        let encrypted = encrypt::encrypt_with_key(&key, &compressed)?;
        let embedded = message::embed(cover, &encrypted);

        Ok(embedded)
    }

    #[wasm_bindgen]
    pub fn reveal(
        &self,
        secret: &str,
        password: &str,
        salt: &str,
    ) -> Result<String, JsValue> {
        validate_inputs(password, salt, None, Some(secret))?;

        let encrypted_data = message::extract_and_reveal(secret)?;
        let key = get_or_derive_key(&self.key_cache, password, salt)?;
        let decrypted_data = encrypt::decrypt_with_key(&key, &encrypted_data)?;
        let decompressed = compact::decompress(&decrypted_data)?;

        let result = String::from_utf8(decompressed)
            .map_err(|_| StegError::Integrity("Invalid UTF-8 in decompressed data"))?;

        Ok(result)
    }

    #[wasm_bindgen(js_name = isCloaked)]
    pub fn is_cloaked(text: &str) -> bool {
        message::has_payload(text)
    }
}

impl Default for StegCloak {
    fn default() -> Self {
        Self::new()
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn validate_inputs(
    password: &str,
    salt: &str,
    message: Option<&str>,
    secret: Option<&str>,
) -> Result<(), JsValue> {
    if password.is_empty() {
        return Err(StegError::Validation("Password is required").into());
    }
    if salt.is_empty() {
        return Err(StegError::Validation("Salt is required").into());
    }
    if let Some(m) = message {
        if m.is_empty() {
            return Err(StegError::Validation("Message cannot be empty").into());
        }
    }
    if let Some(s) = secret {
        if s.is_empty() {
            return Err(StegError::Validation("Input cannot be empty").into());
        }
    }
    Ok(())
}

fn build_cache_key(password: &str, salt: &str) -> Vec<u8> {
    let salt_bytes = salt.as_bytes();
    let password_bytes = password.as_bytes();

    let mut key = Vec::with_capacity(8 + salt_bytes.len() + password_bytes.len());
    key.extend_from_slice(&(salt_bytes.len() as u64).to_le_bytes());
    key.extend_from_slice(salt_bytes);
    key.extend_from_slice(password_bytes);
    key
}

fn get_or_derive_key(
    cache: &Arc<Mutex<HashMap<Vec<u8>, [u8; encrypt::KEY_LENGTH]>>>,
    password: &str,
    salt: &str,
) -> Result<[u8; encrypt::KEY_LENGTH], JsValue> {
    let cache_key = build_cache_key(password, salt);

    if let Some(k) = cache.lock().unwrap().get(&cache_key) {
        return Ok(*k);
    }

    let derived = encrypt::derive_key(password, salt.as_bytes())?;
    cache.lock().unwrap().insert(cache_key, derived);

    Ok(derived)
}