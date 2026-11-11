import { describe, expect, it, vi } from "vitest";
import type { AppBootstrap } from "./types";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

import { api } from "./api";

describe("api.mediaUrl", () => {
  it("falls back to convertFileSrc before bootstrap and uses loopback server URL after bootstrap", async () => {
    const samplePath = "/home/david/Downloads/sample_video.mp4 (240p).mp4";
    expect(api.mediaUrl(samplePath)).toBe(
      `asset://localhost/${encodeURIComponent(samplePath)}`
    );

    const fakeBootstrap: Partial<AppBootstrap> = {
      media_base_url: "http://127.0.0.1:41234",
      media_token: "tok_abc_123",
    };
    invokeMock.mockResolvedValueOnce(fakeBootstrap);

    await api.getBootstrap();

    const url = api.mediaUrl(samplePath);
    expect(url).toContain("http://127.0.0.1:41234/media/");
    expect(url).toContain("token=tok_abc_123");
    expect(url).toContain(`path=${encodeURIComponent(samplePath)}`);
    expect(api.mediaUrl("C:\\Videos\\bài nói+1.mp3")).toContain(
      `path=${encodeURIComponent("C:\\Videos\\bài nói+1.mp3")}`
    );
  });
});
