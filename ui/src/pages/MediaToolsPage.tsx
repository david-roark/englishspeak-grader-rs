import { useState } from "react";
import { FileAudio, FileVideo, FolderOpen, Minimize2, Music } from "lucide-react";
import { ProgressPanel } from "../components/ProgressPanel";
import { api } from "../lib/api";
import type { FileInfo, MediaOutput, Mp3Preset, VideoPreset } from "../lib/types";

interface MediaToolsPageProps {
  videoPresets: VideoPreset[];
  mp3Presets: Mp3Preset[];
  ffmpegAvailable: boolean;
}

export function MediaToolsPage({
  videoPresets,
  mp3Presets,
  ffmpegAvailable,
}: MediaToolsPageProps) {
  // Video compression state
  const [compFile, setCompFile] = useState<FileInfo | null>(null);
  const [compPreset, setCompPreset] = useState("balanced");
  const [compOut, setCompOut] = useState<MediaOutput | null>(null);
  const [compTaskId, setCompTaskId] = useState<string | null>(null);
  const [compStage, setCompStage] = useState("");
  const [compPct, setCompPct] = useState<number | null>(null);
  const [compErr, setCompErr] = useState("");

  // MP3 extraction state
  const [mp3File, setMp3File] = useState<FileInfo | null>(null);
  const [mp3Preset, setMp3Preset] = useState("balanced");
  const [mp3Out, setMp3Out] = useState<MediaOutput | null>(null);
  const [mp3TaskId, setMp3TaskId] = useState<string | null>(null);
  const [mp3Stage, setMp3Stage] = useState("");
  const [mp3Pct, setMp3Pct] = useState<number | null>(null);
  const [mp3Err, setMp3Err] = useState("");

  async function pickForCompress() {
    setCompErr("");
    const p = await api.pickVideoFile();
    if (!p) return;
    setCompFile(await api.inspectFile(p));
    setCompOut(null);
  }

  async function runCompress() {
    if (!compFile) return;
    setCompErr("");
    const taskId = `standalone_comp_${Date.now()}`;
    setCompTaskId(taskId);
    setCompStage("Đang chuẩn bị nén video...");
    setCompPct(0);

    const unlisten = await api.listenProgress(taskId, (p) => {
      setCompStage(p.stage);
      setCompPct(p.percent);
    });

    try {
      const out = await api.compressVideo({
        taskId,
        videoPath: compFile.path,
        preset: compPreset,
      });
      setCompOut(out);
    } catch (e) {
      setCompErr(String(e));
    } finally {
      unlisten();
      setCompTaskId(null);
    }
  }

  async function pickForMp3() {
    setMp3Err("");
    const p = await api.pickVideoFile();
    if (!p) return;
    setMp3File(await api.inspectFile(p));
    setMp3Out(null);
  }

  async function runMp3() {
    if (!mp3File) return;
    setMp3Err("");
    const taskId = `standalone_mp3_${Date.now()}`;
    setMp3TaskId(taskId);
    setMp3Stage("Đang chuẩn bị tách MP3...");
    setMp3Pct(0);

    const unlisten = await api.listenProgress(taskId, (p) => {
      setMp3Stage(p.stage);
      setMp3Pct(p.percent);
    });

    try {
      const out = await api.extractMp3({
        taskId,
        videoPath: mp3File.path,
        preset: mp3Preset,
      });
      setMp3Out(out);
    } catch (e) {
      setMp3Err(String(e));
    } finally {
      unlisten();
      setMp3TaskId(null);
    }
  }

  return (
    <div className="space-y-4">
      {!ffmpegAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Chưa phát hiện <code>ffmpeg</code> trên hệ thống. Hãy vào tab{" "}
          <strong>Cài đặt & Prompt</strong> để kiểm tra hoặc trỏ đường dẫn tới binary{" "}
          <code>ffmpeg</code>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Compress Video */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Minimize2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Nén video (Giảm dung lượng)
            </h2>
          </div>

          <button
            type="button"
            onClick={pickForCompress}
            disabled={compTaskId !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-700 hover:border-indigo-300"
          >
            <FileVideo className="h-5 w-5 text-slate-400" />
            {compFile
              ? `${compFile.name} (${compFile.size_mb.toFixed(2)} MB)`
              : "Chọn video nguồn cần nén"}
          </button>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Chất lượng nén
            </label>
            <select
              value={compPreset}
              onChange={(e) => setCompPreset(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {videoPresets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={runCompress}
            disabled={!compFile || compTaskId !== null || !ffmpegAvailable}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {compTaskId ? "Đang nén..." : "Thực hiện nén video"}
          </button>

          {compTaskId && (
            <ProgressPanel
              stage={compStage}
              percent={compPct}
              onCancel={() => api.cancelTask(compTaskId)}
            />
          )}

          {compErr && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              ⚠️ {compErr}
            </div>
          )}

          {compOut && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>
                  ✅ {compOut.file_name} ({compOut.size_mb.toFixed(2)} MB
                  {compOut.orig_size_mb > 0
                    ? ` — giảm ${((1 - compOut.size_mb / compOut.orig_size_mb) * 100).toFixed(1)}%`
                    : ""}
                  )
                </span>
                <button
                  type="button"
                  onClick={() => api.revealInFolder(compOut.output_path)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-2xs hover:bg-emerald-100"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Mở thư mục
                </button>
              </div>
              <video
                src={api.mediaUrl(compOut.output_path)}
                controls
                className="aspect-video w-full rounded-lg bg-black"
              />
            </div>
          )}
        </div>

        {/* Card 2: Extract MP3 */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Tách âm thanh MP3
            </h2>
          </div>

          <button
            type="button"
            onClick={pickForMp3}
            disabled={mp3TaskId !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-700 hover:border-indigo-300"
          >
            <FileAudio className="h-5 w-5 text-slate-400" />
            {mp3File
              ? `${mp3File.name} (${mp3File.size_mb.toFixed(2)} MB)`
              : "Chọn video nguồn cần tách MP3"}
          </button>

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Chất lượng âm thanh
            </label>
            <select
              value={mp3Preset}
              onChange={(e) => setMp3Preset(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {mp3Presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Nhỏ gọn &amp; Cân bằng dùng mono — tối ưu cho giọng nói và giảm một nửa dung lượng.
            </p>
          </div>

          <button
            type="button"
            onClick={runMp3}
            disabled={!mp3File || mp3TaskId !== null || !ffmpegAvailable}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mp3TaskId ? "Đang tách MP3..." : "Tách MP3"}
          </button>

          {mp3TaskId && (
            <ProgressPanel
              stage={mp3Stage}
              percent={mp3Pct}
              onCancel={() => api.cancelTask(mp3TaskId)}
            />
          )}

          {mp3Err && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              ⚠️ {mp3Err}
            </div>
          )}

          {mp3Out && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>
                  ✅ {mp3Out.file_name} ({mp3Out.size_mb.toFixed(2)} MB)
                </span>
                <button
                  type="button"
                  onClick={() => api.revealInFolder(mp3Out.output_path)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-2xs hover:bg-emerald-100"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Mở thư mục
                </button>
              </div>
              <audio
                src={api.mediaUrl(mp3Out.output_path)}
                controls
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
