//! LegendList learns its unvisited-row estimate from measured rows. Keep the same
//! bounded, per-conversation knowledge without mounting the rest of the history.
use std::collections::HashMap;

#[derive(Default, PartialEq)]
pub enum ScrollStart {
    #[default]
    Initial,
    Priming,
    Applied,
}

#[cfg(test)]
mod tests {
    use super::Measurements;

    #[test]
    fn measured_estimates_round_update_in_place_and_reset_on_rewrap() {
        let mut m = Measurements::default();
        assert_eq!(m.estimate(), 100.0);
        m.record("user", 768.0, 14.0, 66.75);
        m.record("answer", 768.0, 14.0, 84.75);
        assert_eq!(m.estimate(), 76.0);
        assert!(!m.record("user", 768.0, 14.0, 66.75));
        m.record("answer", 768.0, 14.0, 100.0);
        assert_eq!(m.estimate(), 83.5);
        m.record("answer", 320.0, 14.0, 120.0);
        assert_eq!(m.estimate(), 120.0);
        assert_eq!(m.heights.len(), 1);
        m.record("user", 320.0, 18.0, 90.0);
        assert_eq!(m.estimate(), 90.0);
        for i in 0..2048 {
            m.record(&i.to_string(), 320.0, 18.0, 90.0);
        }
        assert_eq!(m.heights.len(), 1024);
        assert_eq!(m.estimate(), 90.0);
    }
}

#[derive(Default)]
pub struct Measurements {
    context: (u32, u32),
    heights: HashMap<String, f32>,
    sum: f64,
}
impl Measurements {
    pub fn estimate(&self) -> f32 {
        if self.heights.is_empty() {
            100.0
        } else {
            // LegendList's roundSize uses eighths of a logical pixel.
            ((self.sum / self.heights.len() as f64 * 8.0).floor() / 8.0) as f32
        }
    }
    pub fn record(&mut self, id: &str, width: f32, font: f32, height: f32) -> bool {
        let context = (width.to_bits(), font.to_bits());
        if self.context != context {
            self.context = context;
            self.heights.clear();
            self.sum = 0.0;
        }
        let before = self.estimate();
        let height = height.round();
        if let Some(previous) = self.heights.get_mut(id) {
            self.sum += (height - *previous) as f64;
            *previous = height;
        } else if self.heights.len() < 1024 {
            self.heights.insert(id.to_owned(), height);
            self.sum += height as f64;
        }
        self.estimate() != before
    }
}
