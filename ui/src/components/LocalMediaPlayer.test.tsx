import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { openLocalFileMock, mediaUrlMock, authorizeMediaPathMock } = vi.hoisted(() => ({
  openLocalFileMock: vi.fn(),
  mediaUrlMock: vi.fn((p: string) => `http://127.0.0.1:9999/media?path=${encodeURIComponent(p)}`),
  authorizeMediaPathMock: vi.fn<() => Promise<string>>(),
}));

vi.mock("../lib/api", () => ({
  api: {
    mediaUrl: mediaUrlMock,
    openLocalFile: openLocalFileMock,
    authorizeMediaPath: authorizeMediaPathMock,
  },
}));

import { LocalMediaPlayer } from "./LocalMediaPlayer";

describe("LocalMediaPlayer", () => {
  it("renders audio/video player with preload=auto and shows recovery actions on playback error", async () => {
    authorizeMediaPathMock.mockResolvedValue("http://127.0.0.1:9999/media?path=%2Ftmp%2Ftest.mp3");
    const { container, rerender } = render(
      <LocalMediaPlayer path="/tmp/test.mp3" kind="audio" />
    );

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("preload")).toBe("auto");
    expect(audio?.getAttribute("src")).toContain("%2Ftmp%2Ftest.mp3");

    fireEvent.error(audio!);

    expect(
      await screen.findByText(/Không phát được file media trong app|Trình phát media trong app/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mở trình phát ngoài/i }));
    expect(openLocalFileMock).toHaveBeenCalledWith("/tmp/test.mp3");

    // Switching to another file path clears the prior error banner
    authorizeMediaPathMock.mockResolvedValue("http://127.0.0.1:9999/media?path=%2Ftmp%2Fnext.mp4");
    rerender(<LocalMediaPlayer path="/tmp/next.mp4" kind="video" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("auto");
    expect(screen.queryByRole("button", { name: /Mở trình phát ngoài/i })).toBeNull();
  });

  it("keeps video src and forwarded ref stable when authorizeMediaPath differs only by percent-encoding", async () => {
    const path = "/tmp/sample (240p).mp4";
    // Rust percent_encode encodes parentheses as %28 / %29, while encodeURIComponent leaves them literal
    authorizeMediaPathMock.mockResolvedValue(
      "http://127.0.0.1:9999/media?path=%2Ftmp%2Fsample%20%28240p%29.mp4"
    );

    const ref = createRef<HTMLMediaElement>();
    const { container, rerender } = render(
      <LocalMediaPlayer ref={ref} path={path} kind="video" />
    );

    const video = container.querySelector("video")!;
    const initialSrc = video.getAttribute("src");
    expect(ref.current).toBe(video);

    await act(async () => {
      await Promise.resolve();
    });

    // src should not swap to %28/%29 because decodeURIComponent matches
    expect(video.getAttribute("src")).toBe(initialSrc);

    // Re-rendering (e.g. onTimeUpdate parent state change) keeps the same ref attached
    rerender(<LocalMediaPlayer ref={ref} path={path} kind="video" className="extra" />);
    expect(ref.current).toBe(video);
  });
});
