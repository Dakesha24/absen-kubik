"use client";

import { useEffect, useState, type FormEvent } from "react";

type Status = { configured: boolean; source: "admin" | "environment" | null; encryptionReady: boolean; hasRootFolder: boolean };

export default function AdminDriveSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clearRoot, setClearRoot] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/drive-settings", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Gagal memuat pengaturan.");
    setStatus(result);
  }

  useEffect(() => { void refresh().catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat pengaturan.")); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/drive-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: values.get("clientId"), clientSecret: values.get("clientSecret"), refreshToken: values.get("refreshToken"), rootFolderId: values.get("rootFolderId"), clearRootFolder: clearRoot }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan pengaturan.");
      form.reset(); setClearRoot(false); await refresh(); setMessage("Pengaturan disimpan. Uji koneksi untuk memastikan Google Drive siap digunakan.");
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan."); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/drive-settings", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menguji koneksi.");
      setMessage("Koneksi berhasil. Akun Google dapat menambahkan file ke folder dokumentasi.");
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menguji koneksi."); }
    finally { setBusy(false); }
  }

  return <section className="card admin-drive-settings">
    <div className="card-heading"><div><h2>Pengaturan Google Drive</h2><p>Hubungkan Drive untuk menyimpan dokumentasi pertemuan.</p></div><span className={`status ${status?.configured ? "ok" : "wait"}`}>{status ? status.configured ? "Tersimpan" : "Belum diatur" : "Memuat"}</span></div>
    {status && !status.encryptionReady && <div className="message error" role="status">Kunci enkripsi pengaturan belum disiapkan di server. Hubungi pengelola aplikasi sebelum menyimpan.</div>}
    {status?.source === "environment" && <div className="message info">Saat ini aplikasi menggunakan konfigurasi dari server. Menyimpan di sini akan menggantikannya.</div>}
    {message && <div className="message success" role="status">{message}</div>}
    {error && <div className="message error" role="alert">{error}</div>}
    <form className="form-stack" onSubmit={save} autoComplete="off">
      <div className="field"><label htmlFor="drive-client-id">Google Client ID</label><input id="drive-client-id" name="clientId" type="password" autoComplete="off" placeholder={status?.configured ? "Kosongkan untuk mempertahankan nilai" : "Masukkan Client ID"} /></div>
      <div className="field"><label htmlFor="drive-client-secret">Google Client Secret</label><input id="drive-client-secret" name="clientSecret" type="password" autoComplete="new-password" placeholder={status?.configured ? "Kosongkan untuk mempertahankan nilai" : "Masukkan Client Secret"} /></div>
      <div className="field"><label htmlFor="drive-refresh-token">Google Refresh Token</label><input id="drive-refresh-token" name="refreshToken" type="password" autoComplete="new-password" placeholder={status?.configured ? "Kosongkan untuk mempertahankan nilai" : "Masukkan Refresh Token"} /></div>
      <div className="field"><label htmlFor="drive-folder">ID folder induk <span className="muted">(opsional)</span></label><input id="drive-folder" name="rootFolderId" autoComplete="off" disabled={clearRoot} placeholder={status?.hasRootFolder ? "Kosongkan untuk mempertahankan folder" : "Kosongkan untuk membuat folder otomatis"} />{status?.hasRootFolder && <label className="check-row"><input type="checkbox" checked={clearRoot} onChange={(event) => setClearRoot(event.target.checked)} /> Gunakan folder otomatis</label>}<span className="field-help">Tanpa ID folder, aplikasi membuat folder ABSEN-KUBIK di Drive.</span></div>
      <div className="drive-settings-actions"><button className="btn" type="submit" disabled={busy || !status?.encryptionReady}>Simpan pengaturan</button><button className="btn ghost" type="button" disabled={busy || !status?.configured} onClick={() => void test()}>{busy ? "Memproses…" : "Uji koneksi"}</button></div>
    </form>
  </section>;
}
