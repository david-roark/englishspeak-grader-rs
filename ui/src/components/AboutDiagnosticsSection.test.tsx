import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppDiagnostics } from "../lib/types";

const { getDiagnosticsMock, clearActivityLogsMock, openDiagnosticPathMock } = vi.hoisted(() => ({
  getDiagnosticsMock: vi.fn<() => Promise<AppDiagnostics>>(),
  clearActivityLogsMock: vi.fn<() => Promise<AppDiagnostics>>(),
  openDiagnosticPathMock: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => ({
  api: {
    getDiagnostics: getDiagnosticsMock,
    clearActivityLogs: clearActivityLogsMock,
    openDiagnosticPath: openDiagnosticPathMock,
  },
}));

import { AboutDiagnosticsSection } from "./AboutDiagnosticsSection";

const SAMPLE_DIAG: AppDiagnostics = {
  app_name: "EnglishSpeak Grader",
  app_version: "0.1.0",
  os: "linux",
  arch: "x86_64",
  is_portable: false,
  data_dir: "/tmp/esg/data",
  db_path: "/tmp/esg/data/grader.db",
  exports_dir: "/tmp/esg/exports",
  log_file_path: "/tmp/esg/data/logs/app.log",
  ffmpeg_path: "/usr/bin/ffmpeg",
  fonts_dir: "/tmp/esg/fonts",
  media_server_port: 43210,
  license_summary: "Personal & Non-Commercial Use License (All Rights Reserved)",
  logs: [
    {
      timestamp_ms: 1700000002000,
      level: "ERROR",
      category: "gemini",
      message: "Quota exceeded (AIza••••)",
    },
    {
      timestamp_ms: 1700000001000,
      level: "INFO",
      category: "app",
      message: "Khởi động v0.1.0",
    },
  ],
};

describe("AboutDiagnosticsSection", () => {
  it("loads diagnostics, filters logs by level, and clears logs", async () => {
    getDiagnosticsMock.mockResolvedValue(SAMPLE_DIAG);
    clearActivityLogsMock.mockResolvedValue({
      ...SAMPLE_DIAG,
      logs: [
        {
          timestamp_ms: 1700000003000,
          level: "INFO",
          category: "app",
          message: "Đã xoá nhật ký hoạt động cũ.",
        },
      ],
    });

    render(<AboutDiagnosticsSection />);

    expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByText("linux / x86_64")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:43210")).toBeInTheDocument();
    expect(screen.getByText(/Quota exceeded/)).toBeInTheDocument();
    expect(screen.getByText(/Khởi động v0.1.0/)).toBeInTheDocument();

    // Filter to ERROR only
    fireEvent.click(screen.getByRole("button", { name: /^ERROR \(1\)/ }));
    expect(screen.getByText(/Quota exceeded/)).toBeInTheDocument();
    expect(screen.queryByText(/Khởi động v0.1.0/)).toBeNull();

    // Open data folder & log file
    fireEvent.click(screen.getByRole("button", { name: /Mở thư mục dữ liệu/i }));
    await waitFor(() => {
      expect(openDiagnosticPathMock).toHaveBeenCalledWith("/tmp/esg/data");
    });
    fireEvent.click(screen.getByRole("button", { name: /Mở file log/i }));
    await waitFor(() => {
      expect(openDiagnosticPathMock).toHaveBeenCalledWith("/tmp/esg/data/logs/app.log");
    });

    // Clear logs
    fireEvent.click(screen.getByRole("button", { name: /Xoá log/i }));
    await waitFor(() => {
      expect(clearActivityLogsMock).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /^Tất cả/ }));
    expect(await screen.findByText(/Đã xoá nhật ký hoạt động cũ/)).toBeInTheDocument();
  });
});
