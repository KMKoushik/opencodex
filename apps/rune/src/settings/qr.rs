//! uqr-compatible byte segmentation and Nayuki mask scoring over Rust QR codewords.
// MIT License
// Copyright (c) Project Nayuki
// Copyright (c) 2023 Anthony Fu <https://github.com/antfu>
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
use qrcode::{
    Color, EcLevel, Version,
    bits::Bits,
    canvas::{Canvas, MaskPattern},
};
pub fn modules(url: &str) -> Option<(usize, Vec<bool>)> {
    for version in 1..=40 {
        let version = Version::Normal(version);
        let mut bits = Bits::new(version);
        if bits.push_byte_data(url.as_bytes()).is_err() || bits.push_terminator(EcLevel::M).is_err()
        {
            continue;
        }
        let (data, ec) =
            qrcode::ec::construct_codewords(&bits.into_bytes(), version, EcLevel::M).ok()?;
        let mut canvas = Canvas::new(version, EcLevel::M);
        canvas.draw_all_functional_patterns();
        canvas.draw_data(&data, &ec);
        let size = version.width() as usize;
        let mut best = None;
        let mut minimum = i32::MAX;
        for mask in [
            MaskPattern::Checkerboard,
            MaskPattern::HorizontalLines,
            MaskPattern::VerticalLines,
            MaskPattern::DiagonalLines,
            MaskPattern::LargeCheckerboard,
            MaskPattern::Fields,
            MaskPattern::Diamonds,
            MaskPattern::Meadow,
        ] {
            let mut candidate = canvas.clone();
            candidate.apply_mask(mask);
            let matrix: Vec<_> = candidate
                .into_colors()
                .into_iter()
                .map(|c| c == Color::Dark)
                .collect();
            let score = penalty(&matrix, size);
            if score < minimum {
                minimum = score;
                best = Some(matrix);
            }
        }
        return best.map(|matrix| (size, matrix));
    }
    None
}
fn add(length: i32, history: &mut [i32; 7], size: i32) {
    let length = length + if history[0] == 0 { size } else { 0 };
    history.rotate_right(1);
    history[0] = length;
}
fn count(h: &[i32; 7]) -> i32 {
    let n = h[1];
    let core = n > 0 && h[2] == n && h[3] == n * 3 && h[4] == n && h[5] == n;
    i32::from(core && h[0] >= 4 * n && h[6] >= n) + i32::from(core && h[6] >= 4 * n && h[0] >= n)
}
fn penalty(matrix: &[bool], size: usize) -> i32 {
    let mut result = 0;
    for vertical in [false, true] {
        for line in 0..size {
            let mut color = false;
            let mut length = 0;
            let mut history = [0; 7];
            for i in 0..size {
                let value = matrix[if vertical {
                    i * size + line
                } else {
                    line * size + i
                }];
                if value == color {
                    length += 1;
                    if length == 5 {
                        result += 3;
                    } else if length > 5 {
                        result += 1;
                    }
                } else {
                    add(length, &mut history, size as i32);
                    if !color {
                        result += 40 * count(&history);
                    }
                    color = value;
                    length = 1;
                }
            }
            if color {
                add(length, &mut history, size as i32);
                length = 0;
            }
            add(length + size as i32, &mut history, size as i32);
            result += 40 * count(&history);
        }
    }
    for y in 0..size - 1 {
        for x in 0..size - 1 {
            let c = matrix[y * size + x];
            if c == matrix[y * size + x + 1]
                && c == matrix[(y + 1) * size + x]
                && c == matrix[(y + 1) * size + x + 1]
            {
                result += 3;
            }
        }
    }
    let dark = matrix.iter().filter(|b| **b).count() as i32;
    let total = (size * size) as i32;
    result + (((dark * 20 - total * 10).abs() as f64 / total as f64).ceil() as i32 - 1) * 10
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_web_uqr_byte_segments_and_mask_selection() {
        for (url, width, expected) in [
            (
                "https://settings-pair.example.test/#pair=ABCD-EFGH",
                33,
                17521265468394204820u64,
            ),
            (
                "https://phone.example.test/#pair=1234-5678",
                29,
                14190543666679367227,
            ),
            (
                "https://other.example.test/#pair=ZYXW-VUTS",
                29,
                2455506046620092182,
            ),
        ] {
            let (size, matrix) = modules(url).unwrap();
            assert_eq!(size, width);
            let hash = matrix.iter().fold(14695981039346656037u64, |hash, bit| {
                (hash ^ u64::from(*bit)).wrapping_mul(1099511628211)
            });
            assert_eq!(hash, expected, "{url}");
        }
    }
}
