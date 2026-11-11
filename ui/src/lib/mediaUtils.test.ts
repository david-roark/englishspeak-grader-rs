import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatEditableTimecode,
  getFileExtension,
  getFileStem,
  getParentDir,
  isAudioFilePath,
  isSupportedExtension,
  parseTimecodeToSeconds,
} from "./mediaUtils";

describe("mediaUtils", () => {
  it("parses file extension, stem, and parent directory on POSIX and Windows paths", () => {
    expect(getFileExtension("/home/user/sample_video.mp4 (240p).MP4")).toBe("mp4");
    expect(getFileExtension("C:\\Users\\Teacher\\audio.mp3")).toBe("mp3");
    expect(getFileExtension("no_extension")).toBe("");

    expect(getFileStem("/tmp/bai_noi.hay.mp4")).toBe("bai_noi.hay");
    expect(getParentDir("/home/david/Downloads/video.mp4")).toBe(
      "/home/david/Downloads"
    );
    expect(getParentDir("C:\\Videos\\lesson1\\clip.mov")).toBe(
      "C:\\Videos\\lesson1"
    );
  });

  it("identifies audio files and supported extensions", () => {
    expect(isAudioFilePath("/exports/speech.mp3")).toBe(true);
    expect(isAudioFilePath("voice.WAV")).toBe(true);
    expect(isAudioFilePath("/exports/speech.mp4")).toBe(false);

    expect(isSupportedExtension("clip.mp4", ["mp4", "mov"])).toBe(true);
    expect(isSupportedExtension("clip.mkv", ["mp4", "mov"])).toBe(false);
    expect(isSupportedExtension("anything.xyz", [])).toBe(true);
  });

  it("formats and parses durations and timecodes accurately", () => {
    expect(formatDuration(null)).toBe("--:--");
    expect(formatDuration(-5)).toBe("--:--");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3661)).toBe("1:01:01");

    expect(formatEditableTimecode(12.5)).toBe("00:12.5");
    expect(formatEditableTimecode(3662)).toBe("1:01:02");

    expect(parseTimecodeToSeconds("")).toBeNull();
    expect(parseTimecodeToSeconds("bad")).toBeNull();
    expect(parseTimecodeToSeconds("45")).toBe(45);
    expect(parseTimecodeToSeconds("01:23.5")).toBe(83.5);
    expect(parseTimecodeToSeconds("1:02:03")).toBe(3723);
  });
});
