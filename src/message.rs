use crate::util::StegError;

pub const ZWC: [char; 8] = [
    '\u{200B}', // 0: Zero Width Space
    '\u{200C}', // 1: Zero Width Non-Joiner
    '\u{200D}', // 2: Zero Width Joiner
    '\u{2060}', // 3: Word Joiner
    '\u{2061}', // 4: Function Application
    '\u{2062}', // 5: Invisible Times
    '\u{2063}', // 6: Invisible Separator
    '\u{2064}', // 7: Invisible Plus
];

#[inline(always)]
fn zwc_value(c: char) -> Option<u8> {
    match c {
        '\u{200B}' => Some(0),
        '\u{200C}' => Some(1),
        '\u{200D}' => Some(2),
        '\u{2060}' => Some(3),
        '\u{2061}' => Some(4),
        '\u{2062}' => Some(5),
        '\u{2063}' => Some(6),
        '\u{2064}' => Some(7),
        _ => None,
    }
}

pub fn has_payload(text: &str) -> bool {
    text.chars().any(|c| zwc_value(c).is_some())
}

pub fn embed(cover: &str, data: &[u8]) -> String {
    // Base-8 Encoding: 3 bits per ZWC.
    // Length is roughly (data.len() * 8) / 3
    let mut zwcs = Vec::with_capacity((data.len() * 8 + 2) / 3);
    let mut buffer = 0u16;
    let mut bits = 0;

    for &b in data {
        buffer = (buffer << 8) | (b as u16);
        bits += 8;

        while bits >= 3 {
            bits -= 3;
            let val = (buffer >> bits) & 0b111;
            zwcs.push(ZWC[val as usize]);
        }
    }

    // Handle any remaining bits
    if bits > 0 {
        let val = (buffer << (3 - bits)) & 0b111;
        zwcs.push(ZWC[val as usize]);
    }

    let mut spaces_count = 0;
    let mut in_space = false;
    for c in cover.chars() {
        if c.is_whitespace() {
            if !in_space {
                in_space = true;
                spaces_count += 1;
            }
        } else {
            in_space = false;
        }
    }

    let mut result = String::with_capacity(cover.len() + zwcs.len() * 3);

    if spaces_count == 0 {
        result.push_str(cover);
        for &zwc in &zwcs {
            result.push(zwc);
        }
        return result;
    }

    let base = zwcs.len() / spaces_count;
    let remainder = zwcs.len() % spaces_count;

    let mut data_iter = zwcs.into_iter();
    in_space = false;
    let mut current_space = 0;

    for c in cover.chars() {
        let is_ws = c.is_whitespace();

        if is_ws && !in_space {
            let n = base + usize::from(current_space < remainder);
            for _ in 0..n {
                if let Some(zwc) = data_iter.next() {
                    result.push(zwc);
                }
            }
            current_space += 1;
            in_space = true;
        } else if !is_ws && in_space {
            in_space = false;
        }

        result.push(c);
    }

    for zwc in data_iter {
        result.push(zwc);
    }

    result
}

pub fn extract_and_reveal(cover: &str) -> Result<Vec<u8>, StegError> {
    let mut buf = Vec::new();
    let mut buffer = 0u16;
    let mut bits = 0;

    // Base-8 Decoding
    for c in cover.chars() {
        if let Some(val) = zwc_value(c) {
            buffer = (buffer << 3) | (val as u16);
            bits += 3;

            // Once we have a full byte (8 bits), push it
            if bits >= 8 {
                bits -= 8;
                buf.push((buffer >> bits) as u8);
            }
        }
    }

    if buf.is_empty() {
        return Err(StegError::PayloadNotFound);
    }

    Ok(buf)
}