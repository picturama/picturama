// Mirrors src/common/util/GeometryTypes.ts

use serde::{Deserialize, Serialize};


#[derive(Debug, Serialize, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
