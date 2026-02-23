use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{AeadInOut, KeyInit},
    XChaCha20Poly1305, XNonce,
};

use crate::util::StegError;

pub const IV_LENGTH: usize = 24;
pub const KEY_LENGTH: usize = 32;
pub const AUTH_TAG_LENGTH: usize = 16;

const VERSION_1: u8 = 0x01;

pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LENGTH], StegError> {
    let params = Params::new(65536, 3, 1, Some(KEY_LENGTH))
        .map_err(|e| StegError::KeyDerivation(format!("Invalid Argon2 parameters: {e}")))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_LENGTH];

    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| StegError::KeyDerivation(format!("Argon2 hashing failed: {e}")))?;

    Ok(key)
}

fn fill_random(buf: &mut [u8]) -> Result<(), StegError> {
    getrandom::fill(buf).map_err(|e| StegError::Encryption(format!("RNG failed: {e}")))
}

pub fn encrypt_with_key(key: &[u8; KEY_LENGTH], data: &[u8]) -> Result<Vec<u8>, StegError> {
    let cipher = XChaCha20Poly1305::new(key.into());

    let mut nonce_bytes = [0u8; IV_LENGTH];
    fill_random(&mut nonce_bytes)?;
    let nonce = XNonce::from(nonce_bytes);

    let mut buffer = data.to_vec();

    // Bind the version byte to the authentication tag so it cannot be tampered with
    let aad = [VERSION_1];

    cipher
        .encrypt_in_place(&nonce, &aad, &mut buffer)
        .map_err(|e| StegError::Encryption(format!("XChaCha20-Poly1305 encrypt: {e}")))?;

    let mut out = Vec::with_capacity(1 + IV_LENGTH + buffer.len());
    out.push(VERSION_1);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&buffer);

    Ok(out)
}

pub fn decrypt_with_key(key: &[u8; KEY_LENGTH], payload: &[u8]) -> Result<Vec<u8>, StegError> {
    if payload.is_empty() {
        return Err(StegError::Decryption);
    }

    let version = payload[0];
    match version {
        VERSION_1 => decrypt_v1(key, &payload[1..]),
        _ => Err(StegError::Integrity("Unsupported payload version")),
    }
}

fn decrypt_v1(key: &[u8; KEY_LENGTH], payload: &[u8]) -> Result<Vec<u8>, StegError> {
    if payload.len() < IV_LENGTH + AUTH_TAG_LENGTH {
        return Err(StegError::Decryption);
    }

    let nonce_bytes: [u8; IV_LENGTH] = payload[..IV_LENGTH]
        .try_into()
        .map_err(|_| StegError::Decryption)?;
    let nonce = XNonce::from(nonce_bytes);

    let mut buffer = payload[IV_LENGTH..].to_vec();

    let cipher = XChaCha20Poly1305::new(key.into());

    let aad = [VERSION_1];

    cipher
        .decrypt_in_place(&nonce, &aad, &mut buffer)
        .map_err(|_| StegError::Decryption)?;

    Ok(buffer)
}