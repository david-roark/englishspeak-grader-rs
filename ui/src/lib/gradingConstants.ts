import type { AssignmentImage } from "./types";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const FLEX_SCALE_PRESETS = [10, 20, 100];

export const FLEX_ROUNDING_OPTIONS = [
  { value: "0.5", label: "Làm tròn 0.5" },
  { value: "0.25", label: "Làm tròn 0.25" },
  { value: "0.1", label: "Làm tròn 0.1" },
  { value: "1", label: "Số nguyên (1)" },
  { value: "", label: "Không làm tròn" },
];

export function readClipboardImageFile(file: File): Promise<AssignmentImage> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(
        new Error(
          `Ảnh dán quá lớn (${(file.size / (1024 * 1024)).toFixed(1)} MB). Giới hạn tối đa mỗi ảnh là 15 MB.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      if (commaIdx < 0) {
        reject(new Error("Không đọc được dữ liệu ảnh từ clipboard."));
        return;
      }
      const dataBase64 = result.slice(commaIdx + 1);
      const mimeType = file.type || "image/png";
      resolve({
        name:
          file.name && file.name !== "image.png"
            ? file.name
            : `clipboard_${Date.now()}.png`,
        mime_type: mimeType,
        data_base64: dataBase64,
      });
    };
    reader.onerror = () => reject(new Error("Lỗi đọc ảnh từ clipboard."));
    reader.readAsDataURL(file);
  });
}
