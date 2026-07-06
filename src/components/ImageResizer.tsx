"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import { FiUploadCloud, FiDownload, FiX, FiArchive } from "react-icons/fi";

interface Props { locale?: string; }
type Mode = "percent" | "maxdim";
type OutFormat = "keep" | "jpeg" | "webp" | "png";

interface Item { id: string; name: string; w: number; h: number; blob: Blob; url: string; }

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}
function mimeFor(fmt: OutFormat, t: string): string {
  if (fmt === "jpeg") return "image/jpeg";
  if (fmt === "webp") return "image/webp";
  if (fmt === "png") return "image/png";
  return t === "image/png" ? "image/png" : "image/jpeg";
}
function extFor(m: string): string { return m === "image/jpeg" ? "jpg" : m === "image/webp" ? "webp" : "png"; }

export default function ImageResizer({ locale = "es" }: Props) {
  const isEs = locale === "es";
  const [mode, setMode] = useState<Mode>("percent");
  const [percent, setPercent] = useState(50);
  const [maxDim, setMaxDim] = useState(1280);
  const [format, setFormat] = useState<OutFormat>("keep");
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const resizeOne = useCallback(async (file: File): Promise<Item> => {
    const bitmap = await createImageBitmap(file);
    let w = bitmap.width, h = bitmap.height;
    if (mode === "percent") {
      w = Math.max(1, Math.round(w * percent / 100));
      h = Math.max(1, Math.round(h * percent / 100));
    } else {
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const mime = mimeFor(format, file.type);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b ?? new Blob()), mime, mime === "image/png" ? undefined : 0.92));
    const base = file.name.replace(/\.[^.]+$/, "");
    return { id: `${file.name}-${Math.random().toString(36).slice(2)}`, name: `${base}-${w}x${h}.${extFor(mime)}`, w, h, blob, url: URL.createObjectURL(blob) };
  }, [mode, percent, maxDim, format]);

  const onFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const imgs = [...list].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setFiles((prev) => [...prev, ...imgs]);
  }, []);

  // Reprocess live whenever the originals or settings change (debounced).
  useEffect(() => {
    if (files.length === 0) { setItems([]); return; }
    let cancelled = false;
    setBusy(true);
    const handle = setTimeout(async () => {
      const out: Item[] = [];
      for (const f of files) { try { out.push(await resizeOne(f)); } catch { /* */ } }
      if (cancelled) { out.forEach((o) => URL.revokeObjectURL(o.url)); return; }
      setItems((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return out; });
      setBusy(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [files, resizeOne]);

  const downloadOne = (it: Item) => { const a = document.createElement("a"); a.href = it.url; a.download = it.name; a.click(); };

  const downloadZip = () => {
    const files: Record<string, Uint8Array> = {};
    let pending = items.length;
    if (!pending) return;
    items.forEach((it) => it.blob.arrayBuffer().then((buf) => {
      files[it.name] = new Uint8Array(buf);
      if (--pending === 0) {
        const blob = new Blob([zipSync(files, { level: 0 }) as unknown as BlobPart], { type: "application/zip" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "resized-images.zip"; a.click(); URL.revokeObjectURL(a.href);
      }
    }));
  };

  const clear = () => { items.forEach((it) => URL.revokeObjectURL(it.url)); setItems([]); setFiles([]); };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border/20 bg-surface/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setMode("percent")} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === "percent" ? "border-primary/50 bg-primary/15 text-primary" : "border-border/30 bg-surface/40 text-text-muted"}`}>{isEs ? "Por porcentaje" : "By percentage"}</button>
          <button onClick={() => setMode("maxdim")} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === "maxdim" ? "border-primary/50 bg-primary/15 text-primary" : "border-border/30 bg-surface/40 text-text-muted"}`}>{isEs ? "Por dimensión máx." : "By max dimension"}</button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-text-muted">{isEs ? "Formato" : "Format"}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as OutFormat)} className="rounded-lg border border-border/30 bg-surface/60 px-2 py-1.5 text-xs text-text outline-none">
              <option value="keep">{isEs ? "Mantener" : "Keep"}</option><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="png">PNG</option>
            </select>
          </div>
        </div>
        {mode === "percent" ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{isEs ? "Escala" : "Scale"}</span>
            <input type="range" min={5} max={100} step={5} value={percent} onChange={(e) => setPercent(parseInt(e.target.value))} className="flex-1 accent-primary" />
            <span className="w-10 text-right text-xs font-medium text-text">{percent}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{isEs ? "Lado mayor (px)" : "Longest side (px)"}</span>
            <input type="number" min={16} max={8000} value={maxDim} onChange={(e) => setMaxDim(Math.max(16, parseInt(e.target.value) || 16))} className="w-28 rounded-lg border border-border/30 bg-surface/60 px-2 py-1.5 text-xs text-text outline-none" />
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragOver ? "border-primary/60 bg-primary/5" : "border-border/40 bg-surface/30 hover:border-primary/40"}`}
      >
        <FiUploadCloud className="text-3xl text-primary/70" />
        <p className="text-sm font-medium text-text">{isEs ? "Arrastra imágenes o haz clic (varias a la vez)" : "Drag images or click (multiple at once)"}</p>
        <p className="text-xs text-text-muted/60">{isEs ? "JPG, PNG, WebP · 100% en tu navegador" : "JPG, PNG, WebP · 100% in your browser"}</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>

      {busy && <p className="text-center text-xs text-text-muted/60">{isEs ? "Redimensionando…" : "Resizing…"}</p>}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm text-text">{items.length} {isEs ? "imágenes" : "images"}</p>
            <div className="flex gap-2">
              <button onClick={downloadZip} className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"><FiArchive /> ZIP</button>
              <button onClick={clear} className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-surface/40 px-3 py-1.5 text-xs text-text-muted hover:text-text"><FiX /> {isEs ? "Limpiar" : "Clear"}</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border border-border/20 bg-surface/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text">{it.name}</p>
                  <p className="text-xs text-text-muted/60">{it.w}×{it.h} · {fmtSize(it.blob.size)}</p>
                </div>
                <button onClick={() => downloadOne(it)} className="shrink-0 rounded-lg border border-border/30 p-2 text-text-muted hover:text-primary"><FiDownload className="text-sm" /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
