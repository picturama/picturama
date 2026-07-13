// Image-format readers and decoders: EXIF/XMP metadata extraction, RAW embedded-preview extraction and
// HEIC/HEIF decoding. Grouped so the command layer references a single `image` namespace.

pub mod exif_reader;
pub mod heif;
pub mod raw_reader;
pub mod xmp_reader;
