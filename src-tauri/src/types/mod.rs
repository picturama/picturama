// Shared data types that cross the IPC boundary (mirroring the TypeScript types) plus small geometry
// helpers. Grouped here so the command/reader/store layers all reference a single `types` namespace.

pub mod common_types;
pub mod geometry_types;
