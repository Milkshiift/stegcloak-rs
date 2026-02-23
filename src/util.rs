use wasm_bindgen::prelude::*;

#[derive(Debug, thiserror::Error)]
pub enum StegError {
    #[error("{0}")]
    Validation(&'static str),

    #[error("No hidden payload found in the cover text.")]
    PayloadNotFound,

    #[error("Decryption failed. Wrong password or salt.")]
    Decryption,

    #[error("Data integrity check failed: {0}")]
    Integrity(&'static str),

    #[error("{0}")]
    Compression(String),

    #[error("{0}")]
    Encryption(String),

    #[error("{0}")]
    KeyDerivation(String),
}

impl StegError {
    pub fn js_name(&self) -> &'static str {
        match self {
            Self::Validation(_) => "ValidationError",
            Self::PayloadNotFound => "PayloadNotFoundError",
            Self::Decryption => "DecryptionError",
            Self::Integrity(_) => "IntegrityError",
            Self::Compression(_) => "CompressionError",
            Self::Encryption(_) => "EncryptionError",
            Self::KeyDerivation(_) => "KeyDerivationError",
        }
    }
}

impl From<StegError> for JsValue {
    fn from(e: StegError) -> Self {
        let err = js_sys::Error::new(&e.to_string());
        err.set_name(e.js_name());
        err.into()
    }
}