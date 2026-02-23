use miniz_oxide::deflate::compress_to_vec;
use miniz_oxide::inflate::decompress_to_vec_with_limit;
use crate::util::StegError;

const COMPRESSION_LEVEL: u8 = 10;
const MAX_DECOMPRESSED_SIZE: usize = 50 * 1024 * 1024;

pub fn compress(data: &[u8]) -> Result<Vec<u8>, StegError> {
    if data.is_empty() {
        return Err(StegError::Compression("Cannot compress empty data".into()));
    }
    Ok(compress_to_vec(data, COMPRESSION_LEVEL))
}

pub fn decompress(data: &[u8]) -> Result<Vec<u8>, StegError> {
    if data.is_empty() {
        return Err(StegError::Compression("Cannot decompress empty data".into()));
    }
    decompress_to_vec_with_limit(data, MAX_DECOMPRESSED_SIZE).map_err(|e| match e.status {
        miniz_oxide::inflate::TINFLStatus::HasMoreOutput => {
            StegError::Integrity("Decompression limit exceeded (Payload too large)")
        }
        _ => StegError::Integrity("Decompression stream failed"),
    })
}