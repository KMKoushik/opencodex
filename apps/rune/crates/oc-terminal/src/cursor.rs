/// Blinking is opt-in (the web terminal defaults to a steady cursor). After two idle
/// seconds or focus loss it settles visible and schedules no more frames.
#[derive(Default)]
pub enum Blink {
    #[default]
    Disabled,
    Idle,
    Active {
        until: f64,
        next: f64,
        visible: bool,
    },
}
pub enum Event {
    Enable(bool),
    Activity(f64),
    Blur,
    Tick(f64),
}
impl Blink {
    pub fn visible(&self) -> bool {
        !matches!(self, Self::Active { visible: false, .. })
    }
    pub fn step(&mut self, event: Event) -> Option<f64> {
        match event {
            Event::Enable(on) => *self = if on { Self::Idle } else { Self::Disabled },
            Event::Blur if !matches!(self, Self::Disabled) => *self = Self::Idle,
            Event::Activity(now) if !matches!(self, Self::Disabled) => {
                *self = Self::Active {
                    until: now + 2.,
                    next: now + 0.5,
                    visible: true,
                }
            }
            Event::Tick(now) => {
                if let Self::Active {
                    until,
                    next,
                    visible,
                } = self
                {
                    if now >= *until {
                        *self = Self::Idle;
                    } else if now >= *next {
                        *visible = !*visible;
                        *next = now + 0.5;
                    }
                }
            }
            _ => {}
        }
        match self {
            Self::Active { next, .. } => Some(*next),
            _ => None,
        }
    }
}
