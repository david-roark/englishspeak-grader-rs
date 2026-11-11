import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { openLocalFileMock, mediaUrlMock } = vi.hoisted(() => ({
  openLocalFileMock: vi.fn(),
  mediaUrlMock: vi.fn((p: string) => `http://127.0.0.1:9999/media?path=${encodeURIComponent(p)}`),
}));

vi.mock("../lib/api", () => ({
  api: {
    mediaUrl: mediaUrlMock,
    openLocalFile: openLocalFileMock,
  },
}));

import { LocalMediaPlayer } from "./LocalMediaPlayer";

describe("LocalMediaPlayer", () => {
  it("renders audio/video player and shows recovery actions on playback error", () => {
    const { container, rerender } = render(
      <LocalMediaPlayer path="/tmp/test.mp3" kind="audio" />
    );

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toContain("%2Ftmp%2Ftest.mp3");

    fireEvent.error(audio!);

    expect(
      screen.getByText(/Không phát được file media trong app|Trình phát media trong app/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mở trình phát ngoài/i }));
    expect(openLocalFileMock).toHaveBeenCalledWith("/tmp/test.mp3");

    // Switching to another file path clears the prior error banner
    rerender(<LocalMediaPlayer path="/tmp/next.mp4" kind="video" />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Mở trình phát ngoài/i })).toBeNull();
  });
});
