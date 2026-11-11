import { useEffect, useRef, useState, type RefObject } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isSupportedExtension } from "./mediaUtils";

interface UseFileDropOptions {
  targetRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  acceptedExtensions?: string[];
  onDropFiles: (paths: string[]) => void;
  onRejected?: (message: string) => void;
}

function isPointInsideElement(
  el: HTMLElement | null,
  physicalX: number,
  physicalY: number
): boolean {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const logicalX = physicalX / dpr;
  const logicalY = physicalY / dpr;
  return (
    logicalX >= rect.left &&
    logicalX <= rect.right &&
    logicalY >= rect.top &&
    logicalY <= rect.bottom
  );
}

/**
 * Reusable hook to handle OS file drag-and-drop onto a specific element in Tauri v2.
 */
export function useFileDrop({
  targetRef,
  disabled = false,
  acceptedExtensions,
  onDropFiles,
  onRejected,
}: UseFileDropOptions): { isDraggingOver: boolean } {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const callbacksRef = useRef({
    disabled,
    acceptedExtensions,
    onDropFiles,
    onRejected,
  });
  callbacksRef.current = {
    disabled,
    acceptedExtensions,
    onDropFiles,
    onRejected,
  };

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    async function setupListener() {
      try {
        const webview = getCurrentWebview();
        const fn = await webview.onDragDropEvent((event) => {
          if (!active) return;
          const {
            disabled: isDisabled,
            acceptedExtensions: exts,
            onDropFiles: handleFiles,
            onRejected: handleRejected,
          } = callbacksRef.current;

          if (isDisabled) {
            setIsDraggingOver(false);
            return;
          }

          const payload = event.payload;
          if (payload.type === "leave") {
            setIsDraggingOver(false);
            return;
          }

          const inside = isPointInsideElement(
            targetRef.current,
            payload.position.x,
            payload.position.y
          );

          if (payload.type === "enter" || payload.type === "over") {
            setIsDraggingOver(inside);
            return;
          }

          if (payload.type === "drop") {
            setIsDraggingOver(false);
            if (!inside || payload.paths.length === 0) return;

            const valid = payload.paths.filter((p) =>
              isSupportedExtension(p, exts)
            );
            if (valid.length === 0) {
              const extList = exts?.slice(0, 6).join(", ") ?? "";
              handleRejected?.(
                extList
                  ? `Định dạng file chưa được hỗ trợ (hỗ trợ: ${extList}...).`
                  : "Không có file hợp lệ được thả vào."
              );
              return;
            }
            handleFiles(valid);
          }
        });

        if (!active) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch {
        // Non-Tauri browser preview fallback: ignore gracefully
      }
    }

    void setupListener();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [targetRef]);

  return { isDraggingOver };
}
