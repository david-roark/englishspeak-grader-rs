use std::collections::hash_map::RandomState;
use std::collections::HashSet;
use std::hash::{BuildHasher, Hasher};
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

const MAX_HEADER_LINES: usize = 64;
const MAX_LINE_BYTES: usize = 8192;

/// Local loopback HTTP/1.1 media server supporting Byte-Range (`206 Partial Content`)
/// requests so WebKitGTK/GStreamer `<video>` and `<audio>` elements on Linux (as well
/// as WKWebView and WebView2) can reliably preview and seek local media files.
///
/// Access is restricted to `127.0.0.1`, protected by a per-session random token,
/// and limited strictly to canonicalized file paths explicitly authorized by app commands.
pub struct MediaServer {
    port: u16,
    token: String,
    allowed_paths: Arc<RwLock<HashSet<PathBuf>>>,
}

impl MediaServer {
    pub fn start() -> std::io::Result<Self> {
        let std_listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        let port = std_listener.local_addr()?.port();
        std_listener.set_nonblocking(true)?;

        let token = generate_session_token();
        let allowed_paths = Arc::new(RwLock::new(HashSet::new()));

        let server_token = token.clone();
        let server_paths = Arc::clone(&allowed_paths);

        std::thread::Builder::new()
            .name("media-server".to_string())
            .spawn(move || {
                let Ok(rt) = tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(2)
                    .enable_io()
                    .enable_time()
                    .build()
                else {
                    return;
                };

                rt.block_on(async move {
                    let Ok(listener) = TcpListener::from_std(std_listener) else {
                        return;
                    };
                    loop {
                        let Ok((stream, _addr)) = listener.accept().await else {
                            continue;
                        };
                        let tok = server_token.clone();
                        let paths = Arc::clone(&server_paths);
                        tokio::spawn(async move {
                            let _ = handle_connection(stream, &tok, &paths).await;
                        });
                    }
                });
            })?;

        Ok(Self {
            port,
            token,
            allowed_paths,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    /// Registers an existing regular file path so the local media server may stream it.
    pub fn authorize_path(&self, path: &Path) {
        let Ok(canonical) = std::fs::canonicalize(path) else {
            return;
        };
        if !canonical.is_file() {
            return;
        }
        if let Ok(mut guard) = self.allowed_paths.write() {
            guard.insert(canonical);
        }
    }
}

fn generate_session_token() -> String {
    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();

    let mut parts = [0u64; 4];
    for (idx, slot) in parts.iter_mut().enumerate() {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(now_nanos);
        hasher.write_u32(pid);
        hasher.write_usize(idx);
        *slot = hasher.finish();
    }
    format!(
        "{:016x}{:016x}{:016x}{:016x}",
        parts[0], parts[1], parts[2], parts[3]
    )
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    target: String,
    range_header: Option<String>,
    close_requested: bool,
}

async fn read_http_request(
    reader: &mut BufReader<TcpStream>,
) -> std::io::Result<Option<HttpRequest>> {
    let mut request_line = String::new();
    let bytes_read = read_limited_line(reader, &mut request_line).await?;
    if bytes_read == 0 {
        return Ok(None);
    }

    let trimmed_line = request_line.trim_end_matches(&['\r', '\n'][..]);
    let mut parts = trimmed_line.split_whitespace();
    let Some(method) = parts.next() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "missing HTTP method",
        ));
    };
    let Some(target) = parts.next() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "missing HTTP target",
        ));
    };

    let mut range_header = None;
    let mut close_requested = false;

    for _ in 0..MAX_HEADER_LINES {
        let mut line = String::new();
        let n = read_limited_line(reader, &mut line).await?;
        if n == 0 {
            break;
        }
        let header_line = line.trim_end_matches(&['\r', '\n'][..]);
        if header_line.is_empty() {
            return Ok(Some(HttpRequest {
                method: method.to_ascii_uppercase(),
                target: target.to_string(),
                range_header,
                close_requested,
            }));
        }
        if let Some((name, val)) = header_line.split_once(':') {
            let name_lower = name.trim().to_ascii_lowercase();
            let val_trimmed = val.trim();
            if name_lower == "range" {
                range_header = Some(val_trimmed.to_string());
            } else if name_lower == "connection" && val_trimmed.eq_ignore_ascii_case("close") {
                close_requested = true;
            }
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "header limit exceeded",
    ))
}

async fn read_limited_line(
    reader: &mut BufReader<TcpStream>,
    out: &mut String,
) -> std::io::Result<usize> {
    let mut buf = Vec::with_capacity(256);
    loop {
        let chunk = reader.fill_buf().await?;
        if chunk.is_empty() {
            break;
        }
        if let Some(pos) = chunk.iter().position(|&b| b == b'\n') {
            let take = pos + 1;
            if buf.len() + take > MAX_LINE_BYTES {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "header line too long",
                ));
            }
            buf.extend_from_slice(&chunk[..take]);
            reader.consume(take);
            break;
        } else {
            let len = chunk.len();
            if buf.len() + len > MAX_LINE_BYTES {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "header line too long",
                ));
            }
            buf.extend_from_slice(chunk);
            reader.consume(len);
        }
    }
    let len = buf.len();
    *out = String::from_utf8_lossy(&buf).into_owned();
    Ok(len)
}

async fn handle_connection(
    stream: TcpStream,
    expected_token: &str,
    allowed_paths: &Arc<RwLock<HashSet<PathBuf>>>,
) -> std::io::Result<()> {
    let _ = stream.set_nodelay(true);
    let mut reader = BufReader::with_capacity(16 * 1024, stream);

    loop {
        let Some(req) = read_http_request(&mut reader).await? else {
            break;
        };

        let connection_hdr = if req.close_requested {
            "close"
        } else {
            "keep-alive"
        };

        if req.method == "OPTIONS" {
            let resp = format!(
                "HTTP/1.1 204 No Content\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
                 Access-Control-Allow-Headers: Range\r\n\
                 Content-Length: 0\r\n\
                 Connection: {connection_hdr}\r\n\r\n"
            );
            reader.get_mut().write_all(resp.as_bytes()).await?;
            reader.get_mut().flush().await?;
            if req.close_requested {
                break;
            }
            continue;
        }

        if req.method != "GET" && req.method != "HEAD" {
            write_simple_response(
                reader.get_mut(),
                "405 Method Not Allowed",
                "Method Not Allowed",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        }

        let (token_param, path_param) = parse_query_params(&req.target);
        let Some(tok) = token_param else {
            write_simple_response(
                reader.get_mut(),
                "403 Forbidden",
                "Forbidden",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        };
        if !constant_time_eq(tok.as_bytes(), expected_token.as_bytes()) {
            write_simple_response(
                reader.get_mut(),
                "403 Forbidden",
                "Forbidden",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        }

        let Some(raw_path) = path_param else {
            write_simple_response(
                reader.get_mut(),
                "400 Bad Request",
                "Missing path parameter",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        };

        let resolved = resolve_authorized(allowed_paths, &raw_path);
        let Some(file_path) = resolved else {
            write_simple_response(
                reader.get_mut(),
                "403 Forbidden",
                "Path not authorized or not found",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        };

        let Ok(mut file) = File::open(&file_path).await else {
            write_simple_response(
                reader.get_mut(),
                "404 Not Found",
                "File not found",
                connection_hdr,
            )
            .await?;
            if req.close_requested {
                break;
            }
            continue;
        };

        let total_len = file.metadata().await?.len();
        let mime = mime_for_path(&file_path);

        if let Some(range_val) = req.range_header.as_deref() {
            match parse_byte_range(range_val, total_len) {
                Some((start, end)) => {
                    let content_len = end - start + 1;
                    let headers = format!(
                        "HTTP/1.1 206 Partial Content\r\n\
                         Content-Type: {mime}\r\n\
                         Accept-Ranges: bytes\r\n\
                         Content-Range: bytes {start}-{end}/{total_len}\r\n\
                         Content-Length: {content_len}\r\n\
                         Access-Control-Allow-Origin: *\r\n\
                         Cache-Control: no-store\r\n\
                         Connection: {connection_hdr}\r\n\r\n"
                    );
                    reader.get_mut().write_all(headers.as_bytes()).await?;
                    if req.method == "GET" {
                        file.seek(SeekFrom::Start(start)).await?;
                        let mut bounded = file.take(content_len);
                        tokio::io::copy(&mut bounded, reader.get_mut()).await?;
                    }
                    reader.get_mut().flush().await?;
                }
                None => {
                    let resp = format!(
                        "HTTP/1.1 416 Range Not Satisfiable\r\n\
                         Content-Range: bytes */{total_len}\r\n\
                         Content-Length: 0\r\n\
                         Access-Control-Allow-Origin: *\r\n\
                         Connection: {connection_hdr}\r\n\r\n"
                    );
                    reader.get_mut().write_all(resp.as_bytes()).await?;
                    reader.get_mut().flush().await?;
                }
            }
        } else {
            let headers = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: {mime}\r\n\
                 Accept-Ranges: bytes\r\n\
                 Content-Length: {total_len}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Cache-Control: no-store\r\n\
                 Connection: {connection_hdr}\r\n\r\n"
            );
            reader.get_mut().write_all(headers.as_bytes()).await?;
            if req.method == "GET" && total_len > 0 {
                tokio::io::copy(&mut file, reader.get_mut()).await?;
            }
            reader.get_mut().flush().await?;
        }

        if req.close_requested {
            break;
        }
    }

    Ok(())
}

fn resolve_authorized(
    allowed_paths: &Arc<RwLock<HashSet<PathBuf>>>,
    raw_path: &str,
) -> Option<PathBuf> {
    let canonical = std::fs::canonicalize(Path::new(raw_path)).ok()?;
    if !canonical.is_file() {
        return None;
    }
    let guard = allowed_paths.read().ok()?;
    guard.contains(&canonical).then_some(canonical)
}

async fn write_simple_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
    connection_hdr: &str,
) -> std::io::Result<()> {
    let resp = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: {connection_hdr}\r\n\r\n\
         {body}",
        body.len()
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.flush().await
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub(crate) fn parse_query_params(target: &str) -> (Option<String>, Option<String>) {
    let Some((_, query)) = target.split_once('?') else {
        return (None, None);
    };
    let mut token = None;
    let mut path = None;
    for pair in query.split('&') {
        let Some((k, v)) = pair.split_once('=') else {
            continue;
        };
        if k == "token" {
            token = Some(percent_decode(v));
        } else if k == "path" {
            path = Some(percent_decode(v));
        }
    }
    (token, path)
}

/// Decodes `%XX` UTF-8 percent-encoded bytes without altering literal `+` characters,
/// since `encodeURIComponent` encodes `+` as `%2B` and file paths may contain literal `+`.
pub(crate) fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub(crate) fn parse_byte_range(header: &str, total_len: u64) -> Option<(u64, u64)> {
    if total_len == 0 {
        return None;
    }
    let spec = header.trim().strip_prefix("bytes=")?.trim();
    // Single-range requests cover media seeking; ignore multi-part specs safely.
    if spec.contains(',') {
        return None;
    }
    let (start_str, end_str) = spec.split_once('-')?;
    let start_str = start_str.trim();
    let end_str = end_str.trim();

    if start_str.is_empty() {
        let suffix: u64 = end_str.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = total_len.saturating_sub(suffix);
        return Some((start, total_len - 1));
    }

    let start: u64 = start_str.parse().ok()?;
    if start >= total_len {
        return None;
    }

    let end = if end_str.is_empty() {
        total_len - 1
    } else {
        let parsed_end: u64 = end_str.parse().ok()?;
        if parsed_end < start {
            return None;
        }
        parsed_end.min(total_len - 1)
    };

    Some((start, end))
}

pub(crate) fn mime_for_path(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());
    match ext.as_deref() {
        Some("mp4" | "m4v") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("mpeg" | "mpg") => "video/mpeg",
        Some("wmv") => "video/x-ms-wmv",
        Some("3gp") => "video/3gpp",
        Some("flv") => "video/x-flv",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("ogg" | "oga") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("opus") => "audio/opus",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream as StdTcpStream;

    #[test]
    fn percent_decode_handles_spaces_parens_plus_and_unicode() {
        let encoded =
            "/home/david/Downloads/sample_video.mp4%20(240p)%2B%20b%C3%A0i%20n%C3%B3i.mp4";
        assert_eq!(
            percent_decode(encoded),
            "/home/david/Downloads/sample_video.mp4 (240p)+ bài nói.mp4"
        );
        assert_eq!(percent_decode("a+b%20c"), "a+b c");
    }

    #[test]
    fn parse_byte_range_handles_standard_and_edge_cases() {
        assert_eq!(parse_byte_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_byte_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_byte_range("bytes=-200", 1000), Some((800, 999)));
        assert_eq!(parse_byte_range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(parse_byte_range("bytes=1000-", 1000), None);
        assert_eq!(parse_byte_range("bytes=500-100", 1000), None);
        assert_eq!(parse_byte_range("bytes=0-0", 0), None);
    }

    #[test]
    fn server_streams_authorized_ranges_and_blocks_unauthorized_requests() {
        let server = MediaServer::start().expect("start media server");
        let dir = std::env::temp_dir().join(format!("esg-media-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("sample_video.mp4 (240p).mp4");
        let payload: Vec<u8> = (0..=255).collect();
        std::fs::write(&file_path, &payload).unwrap();

        let encoded_path = percent_encode_for_test(file_path.to_str().unwrap());

        // 1. Unauthorized path (not registered yet) -> 403
        let res_unauth = send_http(
            server.port,
            &format!(
                "GET /media/sample.mp4?token={}&path={encoded_path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                server.token()
            ),
        );
        assert!(res_unauth.starts_with(b"HTTP/1.1 403"));

        // Register file
        server.authorize_path(&file_path);

        // 2. Wrong token -> 403
        let res_bad_tok = send_http(
            server.port,
            &format!(
                "GET /media/sample.mp4?token=wrong&path={encoded_path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
            ),
        );
        assert!(res_bad_tok.starts_with(b"HTTP/1.1 403"));

        // 3. Full GET -> 200 OK with full payload + video/mp4 Content-Type
        let res_full = send_http(
            server.port,
            &format!(
                "GET /media/sample.mp4?token={}&path={encoded_path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                server.token()
            ),
        );
        let (head_str, body) = split_http_response(&res_full);
        assert!(head_str.starts_with("HTTP/1.1 200 OK"));
        assert!(head_str.contains("Content-Type: video/mp4"));
        assert!(head_str.contains("Accept-Ranges: bytes"));
        assert_eq!(body, payload.as_slice());

        // 4. Byte-Range GET -> 206 Partial Content
        let res_range = send_http(
            server.port,
            &format!(
                "GET /media/sample.mp4?token={}&path={encoded_path} HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=10-19\r\nConnection: close\r\n\r\n",
                server.token()
            ),
        );
        let (head_range, body_range) = split_http_response(&res_range);
        assert!(head_range.starts_with("HTTP/1.1 206 Partial Content"));
        assert!(head_range.contains("Content-Range: bytes 10-19/256"));
        assert_eq!(body_range, &payload[10..20]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    fn send_http(port: u16, raw_req: &str) -> Vec<u8> {
        let mut stream = StdTcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(raw_req.as_bytes()).unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).unwrap();
        buf
    }

    fn split_http_response(raw: &[u8]) -> (String, &[u8]) {
        let sep = b"\r\n\r\n";
        let pos = raw.windows(sep.len()).position(|w| w == sep).unwrap();
        let head = String::from_utf8_lossy(&raw[..pos]).into_owned();
        (head, &raw[pos + sep.len()..])
    }

    fn percent_encode_for_test(s: &str) -> String {
        let mut out = String::new();
        for b in s.as_bytes() {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                    out.push(*b as char)
                }
                _ => out.push_str(&format!("%{:02X}", b)),
            }
        }
        out
    }
}
