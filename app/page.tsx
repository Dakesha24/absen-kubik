"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type TutorOption = { id: string; name: string; hasPassword: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"tutor" | "admin">("tutor");
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [selectedTutorId, setSelectedTutorId] = useState("");
  const [tutorsLoading, setTutorsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedTutor = tutors.find((tutor) => tutor.id === selectedTutorId) || null;

  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get("session");
    if (session === "disabled") {
      setError("Akun Anda dinonaktifkan. Hubungi admin.");
    } else if (session === "expired") {
      setError("Sesi Anda sudah berakhir atau belum aktif. Silakan masuk kembali.");
    }
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (data.code === "ACCOUNT_DISABLED") { setError("Akun Anda dinonaktifkan. Hubungi admin."); return; }
      if (!response.ok) return;
      router.replace(data.user?.role === "admin" ? "/admin" : "/tutor");
    }).catch(() => undefined);
  }, [router]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/tutors", { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal memuat daftar tutor.");
      if (active) setTutors(data.tutors || []);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar tutor.");
    }).finally(() => { if (active) setTutorsLoading(false); });
    return () => { active = false; };
  }, []);

  async function selectTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/select-tutor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorId: selectedTutorId, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tidak dapat membuka sesi tutor.");
      router.replace("/tutor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi gangguan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tidak dapat masuk.");
      router.replace(data.user.role === "admin" ? "/admin" : "/tutor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi gangguan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell">
    <section className="login-story"><Image className="login-header-image" src="/images/header-tampilan-awal.jpg" alt="Teaching Attendance Kubikcode" width={1461} height={801} priority /></section>
    <section className="login-panel">
      <div className="login-card">
        <div className="eyebrow" style={{ color: "var(--teal)" }}>{mode === "tutor" ? "Ruang tutor" : "Akses administrator"}</div>
        <h2>{mode === "tutor" ? "Pilih nama tutor" : "Masuk sebagai admin"}</h2>
        <p>{mode === "tutor" ? "Pilih nama Anda untuk membuka menu presensi." : "Masukkan email dan kata sandi administrator."}</p>
        {error && <div className="message error" role="alert">{error}</div>}
        {mode === "tutor" ? <>
          <form className="form-stack" onSubmit={selectTutor}>
            <div className="field"><label htmlFor="tutor">Nama tutor</label><div className="tutor-choice-row"><select id="tutor" required value={selectedTutorId} onChange={(e) => { setSelectedTutorId(e.target.value); setPassword(""); setError(""); }} disabled={tutorsLoading || !tutors.length}><option value="">{tutorsLoading ? "Memuat daftar tutor…" : tutors.length ? "Pilih nama tutor" : "Belum ada tutor aktif"}</option>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select></div></div>
            {selectedTutor?.hasPassword
              ? <div className="field"><label htmlFor="tutor-password">Kata sandi</label><input id="tutor-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi tutor" /></div>
              : null}
            <button className="btn full" type="submit" disabled={loading || tutorsLoading || !selectedTutorId}>{loading ? "Membuka presensi…" : "Lanjut ke presensi"}<span aria-hidden="true">→</span></button>
          </form>
          <button className="btn ghost full login-mode-button" type="button" onClick={() => { setMode("admin"); setPassword(""); setError(""); }}>Masuk sebagai admin</button>
          <div className="footer-note">Tidak menemukan nama Anda? Hubungi administrator ABSEN-KUBIK.</div>
        </> : <>
          <form className="form-stack" onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@kubik.id" /></div>
            <div className="field"><label htmlFor="password">Kata sandi</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" /></div>
            <button className="btn full" type="submit" disabled={loading}>{loading ? "Memeriksa akun…" : "Masuk"}<span aria-hidden="true">→</span></button>
          </form>
          <button className="btn ghost full login-mode-button" type="button" onClick={() => { setMode("tutor"); setPassword(""); setError(""); }}>Kembali ke pilihan tutor</button>
        </>}
      </div>
    </section>
  </main>;
}
