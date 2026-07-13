// Extracts the embedded XMP metadata packet from an image and flattens it into a key/value map for
// the info panel's `xmp` segment. This is the one piece of `getExifData` that `kamadak-exif` cannot
// provide (XMP is RDF/XML, not TIFF/EXIF), so we locate the packet ourselves and parse it with the
// lightweight, pure-Rust `roxmltree` crate.

use indexmap::IndexMap;
use serde_json::Value as JsonValue;

use crate::common_types::ExifSegment;

/// Reads and flattens the XMP packet of an image, if present.
/// Returns `None` when the file has no XMP or it cannot be parsed.
pub fn read_xmp(path: &str) -> Option<ExifSegment> {
    let bytes = std::fs::read(path).ok()?;
    let xml = extract_xmp_packet(&bytes)?;
    parse_xmp(xml)
}

/// Locates the `<x:xmpmeta …>…</x:xmpmeta>` element within raw file bytes. This is format-agnostic
/// (works for JPEG/HEIC/RAW without per-container segment parsing) at the cost of a byte scan. The
/// whole file is read once on demand (only when the info panel is opened), which is acceptable even
/// for large RAW files.
fn extract_xmp_packet(bytes: &[u8]) -> Option<&str> {
    const START: &[u8] = b"<x:xmpmeta";
    const END: &[u8] = b"</x:xmpmeta>";
    let start = find(bytes, START)?;
    let end = find(&bytes[start..], END).map(|i| start + i + END.len())?;
    std::str::from_utf8(&bytes[start..end]).ok()
}

/// First index of `needle` in `haystack` (naive scan; needles here are short and rare).
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Flattens all `rdf:Description` properties into a `localName -> value` map. Attribute properties
/// and simple element properties become their text; `rdf:Bag`/`Seq`/`Alt` containers are joined by
/// ", ". Namespace-exact exifr parity is not attempted — local names are enough for the info panel.
fn parse_xmp(xml: &str) -> Option<ExifSegment> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    let mut map: ExifSegment = IndexMap::new();

    for desc in doc.descendants().filter(|n| n.has_tag_name("Description")) {
        // Properties written as attributes on rdf:Description (e.g. `xmp:Rating="5"`).
        for attr in desc.attributes() {
            if is_structural(attr.name()) {
                continue;
            }
            map.entry(attr.name().to_string())
                .or_insert_with(|| JsonValue::String(attr.value().to_string()));
        }

        // Properties written as child elements (e.g. `<dc:subject><rdf:Bag>…</rdf:Bag></dc:subject>`).
        for prop in desc.children().filter(|n| n.is_element()) {
            let key = prop.tag_name().name();
            if is_structural(key) {
                continue;
            }
            let value = flatten_value(prop);
            if !value.is_empty() {
                map.entry(key.to_string()).or_insert(JsonValue::String(value));
            }
        }
    }

    if map.is_empty() { None } else { Some(map) }
}

/// Renders a property node's value: for a container (`rdf:Bag`/`Seq`/`Alt`) join all `rdf:li` items
/// by ", "; otherwise return the trimmed text content.
fn flatten_value(node: roxmltree::Node) -> String {
    let items: Vec<String> = node
        .descendants()
        .filter(|n| n.has_tag_name("li"))
        .filter_map(|n| n.text().map(|t| t.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    if !items.is_empty() {
        return items.join(", ");
    }
    node.text().map(|t| t.trim().to_string()).unwrap_or_default()
}

/// RDF/XML plumbing names that are not user-facing metadata properties.
fn is_structural(name: &str) -> bool {
    matches!(name, "about" | "RDF" | "Description" | "Bag" | "Seq" | "Alt" | "li" | "xmlns" | "lang")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_attributes_elements_and_containers() {
        let xml = r#"
            <x:xmpmeta xmlns:x="adobe:ns:meta/">
              <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                <rdf:Description rdf:about=""
                    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
                    xmlns:dc="http://purl.org/dc/elements/1.1/"
                    xmp:Rating="4">
                  <xmp:CreatorTool>Picturama</xmp:CreatorTool>
                  <dc:subject>
                    <rdf:Bag>
                      <rdf:li>sunset</rdf:li>
                      <rdf:li>beach</rdf:li>
                    </rdf:Bag>
                  </dc:subject>
                </rdf:Description>
              </rdf:RDF>
            </x:xmpmeta>"#;
        let map = parse_xmp(xml).expect("should parse");
        assert_eq!(map.get("Rating"), Some(&JsonValue::String("4".to_string())));
        assert_eq!(map.get("CreatorTool"), Some(&JsonValue::String("Picturama".to_string())));
        assert_eq!(map.get("subject"), Some(&JsonValue::String("sunset, beach".to_string())));
    }

    #[test]
    fn locates_packet_inside_surrounding_bytes() {
        let mut bytes = b"\xff\xd8\xff\xe1 some jpeg junk ".to_vec();
        bytes.extend_from_slice(b"<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"></x:xmpmeta>");
        bytes.extend_from_slice(b" trailing junk");
        let packet = extract_xmp_packet(&bytes).expect("should locate");
        assert!(packet.starts_with("<x:xmpmeta"));
        assert!(packet.ends_with("</x:xmpmeta>"));
    }

    #[test]
    fn returns_none_without_xmp() {
        assert!(extract_xmp_packet(b"no metadata here").is_none());
    }
}
