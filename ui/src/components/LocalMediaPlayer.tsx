import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ForwardedRef,
} from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

interface LocalMediaPlayerProps {
  path: string;
  kind: "audio" | "video";
  className?: string;
  onTimeUpdate?: (currentTimeSecs: number) => void;
}

function assignMediaRef(
  target: ForwardedRef<HTMLMediaElement>,
  node: HTMLMediaElement | null
) {
  if (typeof target === "function") {
    target(node);
  } else if (target) {
    target.current = node;
  }
}

function describeMediaError(err: MediaError | null): string {
  if (!err) return "Trình phát media trong app không đọc được file này.";
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Quá trình tải media đã bị hủy.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Lỗi luồng dữ liệu khi đọc file media cục bộ.";
    case MediaError.MEDIA_ERR_DECODE:
      return "Không giải mã được codec của file này trong WebView.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Định dạng hoặc codec của file chưa được WebView hỗ trợ trực tiếp.";
    default:
      return err.message || "Không phát được file media trong app.";
  }
}

export const LocalMediaPlayer = forwardRef<
  HTMLMediaElement,
  LocalMediaPlayerProps
>(function LocalMediaPlayer({ path, kind, className, onTimeUpdate }, ref) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [retriedAuth, setRetriedAuth] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [authorizedSrc, setAuthorizedSrc] = useState<{
    path: string;
    src: string;
  } | null>(null);

  const bindMediaRef = useCallback(
    (node: HTMLMediaElement | null) => {
      assignMediaRef(ref, node);
    },
    [ref]
  );

  useEffect(() => {
    setErrorMsg(null);
    setReloadKey(0);
    setRetriedAuth(false);
    setIsPortrait(false);
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    const maybeAuthorize = (
      api as { authorizeMediaPath?: (p: string) => Promise<string> }
    ).authorizeMediaPath;
    if (typeof maybeAuthorize !== "function") {
      return;
    }
    const currentUrl = api.mediaUrl(path);
    void maybeAuthorize(path)
      .then((freshUrl) => {
        if (!cancelled && freshUrl) {
          let isSameDecoded = freshUrl === currentUrl;
          if (!isSameDecoded) {
            try {
              isSameDecoded =
                decodeURIComponent(freshUrl) === decodeURIComponent(currentUrl);
            } catch {
              isSameDecoded = false;
            }
          }
          if (!isSameDecoded) {
            setAuthorizedSrc({ path, src: freshUrl });
          }
        }
      })
      .catch(() => {
        // Fallback synchronously computed url handles offline/mock cases; onError reports playback failures
      });
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  const src =
    authorizedSrc && authorizedSrc.path === path
      ? authorizedSrc.src
      : api.mediaUrl(path);

  function handlePlaybackError(mediaError: MediaError | null) {
    const maybeAuthorize = (
      api as { authorizeMediaPath?: (p: string) => Promise<string> }
    ).authorizeMediaPath;
    if (!retriedAuth && typeof maybeAuthorize === "function") {
      setRetriedAuth(true);
      void maybeAuthorize(path)
        .then((freshUrl) => {
          if (freshUrl && freshUrl !== src) {
            setAuthorizedSrc({ path, src: freshUrl });
            setReloadKey((k) => k + 1);
            setErrorMsg(null);
          } else {
            const msg = describeMediaError(mediaError);
            setErrorMsg(msg);
            void (api as { logClientEvent?: (l: string, c: string, m: string) => Promise<void> }).logClientEvent?.(
              "ERROR",
              "player",
              `Lỗi phát ${path.split(/[/\\]/).pop() || path}: ${msg}`
            );
          }
        })
        .catch(() => {
          const msg = describeMediaError(mediaError);
          setErrorMsg(msg);
          void (api as { logClientEvent?: (l: string, c: string, m: string) => Promise<void> }).logClientEvent?.(
            "ERROR",
            "player",
            `Lỗi phát ${path.split(/[/\\]/).pop() || path}: ${msg}`
          );
        });
      return;
    }
    const msg = describeMediaError(mediaError);
    setErrorMsg(msg);
    void (api as { logClientEvent?: (l: string, c: string, m: string) => Promise<void> }).logClientEvent?.(
      "ERROR",
      "player",
      `Lỗi phát ${path.split(/[/\\]/).pop() || path}: ${msg}`
    );
  }

  return (
    <div className="space-y-1.5">
      {kind === "audio" ? (
        <audio
          key={`${path}-${reloadKey}`}
          ref={bindMediaRef}
          src={src}
          controls
          preload="auto"
          onLoadedMetadata={() => setErrorMsg(null)}
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onSeeked={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onError={(e) => handlePlaybackError(e.currentTarget.error)}
          className={className ?? "w-full"}
        />
      ) : (
        <div
          className={
            isPortrait
              ? "flex justify-center overflow-hidden rounded-lg bg-slate-950"
              : "overflow-hidden rounded-lg bg-black"
          }
        >
          <video
            key={`${path}-${reloadKey}`}
            ref={bindMediaRef}
            src={src}
            controls
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              setErrorMsg(null);
              const v = e.currentTarget;
              if (v.videoWidth > 0 && v.videoHeight > 0) {
                setIsPortrait(v.videoHeight > v.videoWidth);
              }
            }}
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            onSeeked={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            onError={(e) => handlePlaybackError(e.currentTarget.error)}
            className={
              className ??
              (isPortrait
                ? "max-h-[min(56vh,460px)] w-auto max-w-full object-contain"
                : "aspect-video max-h-[300px] w-full object-contain")
            }
          />
        </div>
      )}

      {errorMsg && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{errorMsg}</p>
              <p className="text-[11px] text-amber-700">
                Bạn vẫn có thể chấm điểm / xử lý FFmpeg bình thường hoặc mở bằng trình phát của hệ thống.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setRetriedAuth(false);
                setReloadKey((k) => k + 1);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="h-3 w-3" />
              Thử lại
            </button>
            <button
              type="button"
              onClick={() => void api.openLocalFile(path)}
              className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800"
            >
              <ExternalLink className="h-3 w-3" />
              Mở trình phát ngoài
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
