"use client";

import { useEffect, useId, useRef } from "react";

export default function PasswordChangeDialog({ phase, busy, error, onClose, onConfirm }: {
  phase: "confirm" | "success"; busy: boolean; error: string; onClose: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !latest.current.busy) { event.preventDefault(); latest.current.onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    if (busy) dialog.current?.focus();
    else (phase === "success" ? done.current : cancel.current)?.focus();
  }, [phase, busy]);
  const success = phase === "success";
  return <div className="modal-backdrop password-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="password-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}>
      <button type="button" className="password-dialog-close" onClick={onClose} disabled={busy} aria-label="Tutup">×</button>
      <div className={"password-dialog-icon" + (success ? " is-success" : "")} aria-hidden="true">
        {success ? <svg viewBox="0 0 64 64"><circle className="password-success-ring" cx="32" cy="32" r="26" /><path className="password-success-check" d="m19 33 9 9 18-20" /></svg> : <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>}
      </div>
      <h2 id={titleId}>{success ? "Kata sandi berhasil disimpan" : "Simpan kata sandi baru?"}</h2>
      <p id={descriptionId}>{success ? "Gunakan kata sandi baru saat masuk berikutnya." : "Pastikan kata sandi baru sudah benar sebelum melanjutkan."}</p>
      {error && <div className="message error" role="alert">{error}</div>}
      <div className={"password-dialog-actions" + (success ? " is-success" : "")}>
        {success ? <button type="button" className="btn" ref={done} onClick={onClose}>Selesai</button> : <>
          <button type="button" className="btn ghost" ref={cancel} onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className="btn" onClick={onConfirm} disabled={busy}>{busy ? <><span className="password-saving-spinner" aria-hidden="true" />Menyimpan…</> : "Ya, simpan"}</button>
        </>}
      </div>
    </section>
  </div>;
}
