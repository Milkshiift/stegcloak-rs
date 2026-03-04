# stegcloak-rs

A WASM library for hiding encrypted data within plain text using invisible Unicode characters.     
Used internally in GoofCord.

### Architecture
Uses XChaCha20-Poly1305 with Argon2id key derivation and Deflate for compression.    
For steganography, Base-8 encoding is used using 8 Zero Width Characters, distributed across the whitespaces of a "cover" text.
g