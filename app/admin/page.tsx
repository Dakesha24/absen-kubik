"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { NavIcon, type NavIconName } from "@/components/nav-icon";
import TutorAvatar from "@/components/tutor-avatar";
import AdminSchoolDashboard from "@/components/admin-school-dashboard";
import AdminDriveSettings from "@/components/admin-drive-settings";
import { jakartaCalendar, submittedTime } from "@/lib/time";
import "./admin.css";
import "./schools.css";

type Tutor = { id: string; name: string; active: boolean; created_at: string; hasPassword: boolean };
type KubikClass = { id: string; name: string; description: string | null; location_name: string | null; latitude: number | null; longitude: number | null; radius_m: number | null; active: boolean; student_count: number; weekday: number | null; start_time: string | null; end_time: string | null };
type Meeting = { id: string; meeting_number: number; meeting_date: string; starts_at: string | null; submitted_at: string | null; status: string; class_id: string; class_name: string; tutor_id: string; tutor_name: string; checked_in_at: string | null; attendance_count: number; absent_count: number; evidence_count: number };
type Summary = { tutors: Tutor[]; classes: KubikClass[]; meetings: Meeting[] };
type Detail = { meeting: { class_name: string; meeting_number: number; meeting_date: string; submitted_at: string | null; status: string }; students: Array<{ id: string; name: string; status: string; reason: string | null }>; checkin: null | { latitude: number; longitude: number; accuracy_m: number; distance_m: number | null; location_label: string | null; checked_in_at: string }; evidence: Array<{ id: string; name: string; mime_type: string; size_bytes: number; web_view_link: string | null; created_at: string }> };
type Tab = "ringkasan" | "tutor" | "pertemuan" | "pengaturan";

const nav: Array<{ id: Tab; label: string; icon: NavIconName }> = [
  { id: "ringkasan", label: "Jadwal sekolah", icon: "overview" },
  { id: "tutor", label: "Tutor", icon: "tutors" },
  { id: "pertemuan", label: "Rekap Absensi", icon: "recap" },
  { id: "pengaturan", label: "Pengaturan", icon: "settings" },
];

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function schoolName(className: string) {
  const parts = className.split(/\s+[—–]\s+/);
  return parts.length > 1 ? parts[0] : "Sekolah lainnya";
}

function dateText(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

async function send(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Permintaan gagal.");
  return result;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [data, setData] = useState<Summary>({ tutors: [], classes: [], meetings: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("Admin");
  const [selectedMeeting, setSelectedMeeting] = useState<Detail | null>(null);
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [historySchool, setHistorySchool] = useState("");
  const [historyTutor, setHistoryTutor] = useState("");
  const [creatingTutor, setCreatingTutor] = useState(false);
  const [createTutorError, setCreateTutorError] = useState("");
  const [deactivatingTutor, setDeactivatingTutor] = useState<Tutor | null>(null);
  const [deactivationError, setDeactivationError] = useState("");
  const [renamingTutor, setRenamingTutor] = useState<Tutor | null>(null);
  const [tutorNameDraft, setTutorNameDraft] = useState("");
  const [tutorNameError, setTutorNameError] = useState("");
  const [deletingTutor, setDeletingTutor] = useState<Tutor | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const dialogOpen = Boolean(selectedMeeting || creatingTutor || deactivatingTutor || renamingTutor || deletingTutor);
  const today = jakartaCalendar().date;
  const selectedMonth = historyMonth || today.slice(5, 7);
  const selectedYear = historyYear || today.slice(0, 4);
  const completedMeetings = data.meetings.filter((meeting) => meeting.status === "completed");
  const historyYears = Array.from(new Set([today.slice(0, 4), ...Array.from({ length: 5 }, (_, index) => String(Number(today.slice(0, 4)) - index - 1)), ...completedMeetings.map((meeting) => meeting.meeting_date.slice(0, 4))])).sort((a, b) => b.localeCompare(a));
  const historySchools = Array.from(new Set(completedMeetings.map((meeting) => schoolName(meeting.class_name)))).sort((a, b) => a.localeCompare(b, "id"));
  const historyTutors = Array.from(new Map(completedMeetings.map((meeting) => [meeting.tutor_id, meeting.tutor_name])).entries()).sort((a, b) => a[1].localeCompare(b[1], "id"));
  const visibleMeetings = completedMeetings.filter((meeting) => meeting.meeting_date.slice(0, 7) === `${selectedYear}-${selectedMonth}` && (!historySchool || schoolName(meeting.class_name) === historySchool) && (!historyTutor || meeting.tutor_id === historyTutor));

  const load = useCallback(async () => {
    try {
      const [summary, me] = await Promise.all([send("/api/admin/summary"), send("/api/auth/me")]);
      setData(summary);
      setUserName(me.user?.name || "Admin");
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memuat data.";
      if (message.toLowerCase().includes("masuk") || message.toLowerCase().includes("akses")) router.replace("/");
      else setError(message);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dialogOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('.admin-shell [role="dialog"]');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialog?.getAttribute("aria-busy") !== "true") { setSelectedMeeting(null); setCreatingTutor(false); setCreateTutorError(""); setDeactivatingTutor(null); setDeactivationError(""); setRenamingTutor(null); setTutorNameError(""); setDeletingTutor(null); setDeleteConfirmation(""); setDeleteError(""); }
      if (event.key === "Tab" && dialog) {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const initialFocus = dialog?.querySelector<HTMLElement>('input:not(:disabled)') ?? dialog?.querySelector<HTMLElement>("button");
    initialFocus?.focus();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [dialogOpen]);

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }


  function openCreateTutor() {
    setCreateTutorError("");
    setCreatingTutor(true);
  }
  function closeCreateTutor() {
    if (saving) return;
    setCreatingTutor(false);
    setCreateTutorError("");
  }
  async function createTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true); setCreateTutorError(""); setMessage(""); setError("");
    try { await send("/api/admin/tutors", "POST", body); setCreatingTutor(false); setMessage("Tutor berhasil ditambahkan."); await load(); }
    catch (err) { setCreateTutorError(err instanceof Error ? err.message : "Gagal menambahkan tutor."); }
    finally { setSaving(false); }
  }

  function toggleTutor(tutor: Tutor) {
    if (saving) return;
    if (tutor.active) { setDeactivationError(""); setDeactivatingTutor(tutor); }
    else void updateTutorStatus(tutor, true);
  }
  function closeDeactivation() {
    if (saving) return;
    setDeactivatingTutor(null);
    setDeactivationError("");
  }
  async function updateTutorStatus(tutor: Tutor, active: boolean) {
    if (saving) return;
    setSaving(true); setError(""); setMessage(""); setDeactivationError("");
    try {
      await send("/api/admin/tutors", "PATCH", { id: tutor.id, name: tutor.name, active });
      setDeactivatingTutor(null);
      setMessage(active ? "Akun tutor diaktifkan kembali." : "Akun tutor dinonaktifkan.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memperbarui tutor.";
      if (active) setError(message); else setDeactivationError(message);
    } finally { setSaving(false); }
  }
  function openTutorNameEditor(tutor: Tutor) {
    setTutorNameDraft(tutor.name);
    setTutorNameError("");
    setRenamingTutor(tutor);
  }
  function closeTutorNameEditor() {
    if (saving) return;
    setRenamingTutor(null);
    setTutorNameError("");
  }
  async function saveTutorName() {
    if (!renamingTutor) return;
    const name = tutorNameDraft.trim();
    if (!name || name.length > 120) { setTutorNameError("Nama tutor wajib diisi dan maksimal 120 karakter."); return; }
    if (name === renamingTutor.name) { closeTutorNameEditor(); return; }
    setSaving(true);
    setTutorNameError("");
    try {
      await send("/api/admin/tutors", "PATCH", { id: renamingTutor.id, name, active: renamingTutor.active });
      setMessage("Nama tutor diperbarui.");
      setRenamingTutor(null);
      await load();
    } catch (err) { setTutorNameError(err instanceof Error ? err.message : "Gagal memperbarui nama tutor."); }
    finally { setSaving(false); }
  }
  function openDeleteTutor(tutor: Tutor) {
    setDeleteConfirmation("");
    setDeleteError("");
    setDeletingTutor(tutor);
  }
  function closeDeleteTutor() {
    if (saving) return;
    setDeletingTutor(null);
    setDeleteConfirmation("");
    setDeleteError("");
  }
  async function deleteTutor() {
    if (!deletingTutor || deleteConfirmation !== "delete") return;
    setSaving(true);
    setDeleteError("");
    try {
      await send("/api/admin/tutors", "DELETE", { id: deletingTutor.id });
      setMessage("Tutor " + deletingTutor.name + " berhasil dihapus.");
      setDeletingTutor(null);
      setDeleteConfirmation("");
      await load();
    } catch (err) { setDeleteError(err instanceof Error ? err.message : "Gagal menghapus tutor."); }
    finally { setSaving(false); }
  }
  async function resetTutorPassword(tutor: Tutor) {
    const password = window.prompt(`Masukkan kata sandi baru untuk ${tutor.name} (minimal 12 karakter):`);
    if (password === null) return;
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) { setError("Kata sandi harus 12–72 byte."); return; }
    setError("");
    try { await send("/api/admin/tutors", "PATCH", { id: tutor.id, name: tutor.name, active: tutor.active, password }); setMessage("Kata sandi tutor diperbarui."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal memperbarui kata sandi."); }
  }
  async function openMeeting(meetingId: string) {
    try { const detail = await send(`/api/meetings/${meetingId}`); setSelectedMeeting(detail); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal membuka detail."); }
  }
  async function logout() {
    if (!window.confirm("Apakah Anda yakin ingin keluar dari akun?")) return;
    await send("/api/auth/logout", "POST");
    router.replace("/");
  }

  if (loading) return <main className="tutor-loading-screen" aria-live="polite" aria-busy="true">
    <section className="tutor-loading-card">
      <div className="tutor-loading-brand"><Image className="tutor-loading-logo" src="/images/logo-kubik.jpg" alt="Logo Kubik" width={54} height={54} /><span>ABSEN-KUBIK</span></div>
      <div className="tutor-loading-art" aria-hidden="true"><div className="tutor-loading-orbit" /><div className="tutor-loading-center"><NavIcon name="overview" /></div><span className="tutor-loading-spark spark-one" /><span className="tutor-loading-spark spark-two" /></div>
      <div className="tutor-loading-copy"><p>Menyiapkan ruang admin…</p></div>
      <div className="tutor-loading-progress" role="progressbar" aria-label="Memuat ruang admin"><span /></div>
    </section>
  </main>;

  return <div className="app-shell tutor-shell admin-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span className="brand-symbol">K</span><span>ABSEN-KUBIK</span></div>
      <div className="nav-label">Menu utama</div>
      <nav className="nav-list" aria-label="Navigasi admin">{nav.map((item) => <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} aria-label={item.label} title={item.label} aria-current={tab === item.id ? "page" : undefined} onClick={() => selectTab(item.id)}><span className="nav-icon"><NavIcon name={item.icon} /></span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="user-copy"><strong>{userName}</strong><span>Administrator</span></div></div><button className="btn" onClick={logout}><span>↪</span> Keluar dari akun</button></div>
    </aside>
    <main className="main-area">
      <div className="content">
        <section className="tutor-hero-card" aria-label="Header Kubikcode">
          <Image className="tutor-hero-image" src={tab === "pertemuan" ? "/images/header-rekap-absensi.png" : "/images/header-website-attend.jpg"} alt={tab === "pertemuan" ? "Rekap Absensi Kubikcode" : "Header Kubikcode"} width={tab === "pertemuan" ? 2172 : 1765} height={tab === "pertemuan" ? 724 : 528} priority />
        </section>
        <section className="card class-picker-card admin-identity">
          <div className="presensi-tutor-banner"><TutorAvatar name={userName} className="presensi-tutor-avatar tutor-photo" size={42} /><div><span>Admin</span><strong>{userName}</strong></div><button className="btn danger admin-logout" aria-label="Keluar dari akun" title="Keluar dari akun" onClick={() => void logout()}><NavIcon name="logout" /></button></div>
        </section>
        {(error || message) && <div className={`message admin-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}><span>{error || message}</span><button type="button" aria-label="Tutup pemberitahuan" onClick={() => { setError(""); setMessage(""); }}>×</button></div>}
        {tab === "ringkasan" && <AdminSchoolDashboard classes={data.classes} onReload={load} />}

        {tab === "tutor" && <>
          <PageHeading eyebrow="Manajemen akun" title="Tutor" description="Buat akun tutor dan atur aksesnya ke aplikasi." />
          <div className="section-grid">
            <section className="card">
              <div className="card-heading admin-tutor-heading"><div><h2>Daftar tutor</h2><p>{data.tutors.length} akun terdaftar</p></div><button className="btn small" onClick={openCreateTutor} aria-haspopup="dialog">Tambah tutor</button></div>
              <div className="table-wrap">
                <table className="data-table admin-tutor-table" role="table" aria-label="Daftar tutor">
                  <thead><tr><th>Nama tutor</th><th>Status</th><th>Aksi</th></tr></thead>
                  <tbody role="rowgroup">{data.tutors.map((t) => <tr role="row" key={t.id}>
                    <td role="cell" data-label="Nama tutor"><div className="admin-tutor-cell"><TutorAvatar name={t.name} className="admin-tutor-photo" size={36} /><strong>{t.name}</strong></div></td>
                    <td role="cell" data-label="Status"><span className={`status ${t.active ? "ok" : "neutral"}`}>{t.active ? "Aktif" : "Nonaktif"}</span></td>
                    <td role="cell" data-label="Aksi"><div className="action-row admin-tutor-actions">
                      <button className="btn ghost small" aria-label={`Edit nama ${t.name}`} onClick={() => openTutorNameEditor(t)}>Edit nama</button>
                      <button className="btn ghost small" aria-label={`Reset sandi ${t.name}`} onClick={() => void resetTutorPassword(t)}>Reset sandi</button>
                      <button className={`btn small ${t.active ? "danger" : "secondary"}`} aria-label={`${t.active ? "Nonaktifkan" : "Aktifkan"} ${t.name}`} onClick={() => void toggleTutor(t)}>{t.active ? "Nonaktifkan" : "Aktifkan"}</button>
                      <button className="btn danger small" aria-label={"Hapus " + t.name} onClick={() => openDeleteTutor(t)}>Hapus</button>
                    </div></td>
                  </tr>)}</tbody>
                </table>
                {!data.tutors.length && <Empty text="Belum ada tutor." />}
              </div>
            </section>
          </div>
        </>}

        {tab === "pertemuan" && <section className="card history-card"><div className="card-heading"><div><h2>Rekap Absensi</h2><p>Lihat laporan presensi yang sudah disimpan.</p></div><button className="btn ghost small history-refresh" onClick={() => void load()} aria-label="Muat ulang data"><span aria-hidden="true">↻</span><span>Muat ulang</span></button></div>
          <div className="history-filter-grid admin-history-filters" role="group" aria-label="Filter rekap absensi">
            <div className="field"><label htmlFor="admin-history-month">Bulan</label><select id="admin-history-month" value={selectedMonth} onChange={(event) => setHistoryMonth(event.target.value)}>{monthNames.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}</select></div>
            <div className="field"><label htmlFor="admin-history-year">Tahun</label><select id="admin-history-year" value={selectedYear} onChange={(event) => setHistoryYear(event.target.value)}>{historyYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
            <div className="field"><label htmlFor="admin-history-school">Sekolah</label><select id="admin-history-school" value={historySchool} onChange={(event) => setHistorySchool(event.target.value)}><option value="">Semua sekolah</option>{historySchools.map((school) => <option key={school} value={school}>{school}</option>)}</select></div>
            <div className="field"><label htmlFor="admin-history-tutor">Tutor</label><select id="admin-history-tutor" value={historyTutor} onChange={(event) => setHistoryTutor(event.target.value)}><option value="">Semua tutor</option>{historyTutors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
          </div>
          <div className="history-result-count" aria-live="polite">{visibleMeetings.length} pertemuan</div><MeetingTable meetings={visibleMeetings} onOpen={openMeeting} />
        </section>}
        {tab === "pengaturan" && <AdminDriveSettings />}
        <div className="footer-note">ABSEN-KUBIK · Ruang admin</div>
      </div>
    </main>
    {selectedMeeting && <MeetingModal detail={selectedMeeting} onClose={() => setSelectedMeeting(null)} />}
    {deactivatingTutor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeactivation(); }}>
      <section className="modal school-dialog" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-labelledby="deactivate-tutor-title" aria-describedby="deactivate-tutor-description" aria-busy={saving}>
        <div className="modal-head"><h2 id="deactivate-tutor-title">Nonaktifkan tutor?</h2><button type="button" className="close-btn" onClick={closeDeactivation} disabled={saving} aria-label="Tutup">×</button></div>
        <div className="modal-body">
          <p id="deactivate-tutor-description">Akun <strong>{deactivatingTutor.name}</strong> tidak akan bisa login atau mengakses absensi sampai diaktifkan kembali oleh admin.</p>
          {deactivationError && <div className="message error" role="alert">{deactivationError}</div>}
          <div className="form-actions"><button type="button" className="btn ghost" onClick={closeDeactivation} disabled={saving}>Batal</button><button type="button" className="btn danger" onClick={() => void updateTutorStatus(deactivatingTutor, false)} disabled={saving}>{saving ? "Menyimpan…" : "Nonaktifkan tutor"}</button></div>
        </div>
      </section>
    </div>}
    {creatingTutor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateTutor(); }}>
      <section className="modal school-dialog" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-labelledby="create-tutor-title" aria-busy={saving}>
        <div className="modal-head"><h2 id="create-tutor-title">Tambah tutor</h2><button type="button" className="close-btn" onClick={closeCreateTutor} disabled={saving} aria-label="Tutup">×</button></div>
        <form className="modal-body form-stack" onSubmit={(event) => void createTutor(event)}>
          {createTutorError && <div className="message error" role="alert">{createTutorError}</div>}
          <div className="field"><label htmlFor="create-tutor-name">Nama lengkap</label><input id="create-tutor-name" name="name" required maxLength={120} placeholder="Contoh: Rani Putri" disabled={saving} autoComplete="name" /></div>
          <div className="field"><label htmlFor="create-tutor-password">Kata sandi awal (opsional)</label><input id="create-tutor-password" name="password" type="password" minLength={12} autoComplete="new-password" disabled={saving} /><span className="field-help">Kosongkan jika tutor akan mengatur sandi lewat Profil. Jika diisi, minimal 12 karakter.</span></div>
          <div className="form-actions"><button type="button" className="btn ghost" onClick={closeCreateTutor} disabled={saving}>Batal</button><button type="submit" className="btn" disabled={saving}>{saving ? "Menyimpan…" : "Simpan tutor"}</button></div>
        </form>
      </section>
    </div>}
    {renamingTutor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTutorNameEditor(); }}><section className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-labelledby="rename-tutor-title"><div className="modal-head"><div><h2 id="rename-tutor-title">Edit nama tutor</h2><span className="muted">{renamingTutor.name}</span></div><button className="close-btn" onClick={closeTutorNameEditor} aria-label="Tutup" disabled={saving}>×</button></div>
      <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void saveTutorName(); }}>
        <div className="field"><label htmlFor="rename-tutor-name">Nama tutor</label><input id="rename-tutor-name" value={tutorNameDraft} onChange={(event) => setTutorNameDraft(event.target.value)} maxLength={120} required autoFocus disabled={saving} /></div>
        {tutorNameError && <div className="message error" role="alert">{tutorNameError}</div>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={closeTutorNameEditor} disabled={saving}>Batal</button><button type="submit" className="btn" disabled={saving || !tutorNameDraft.trim()}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button></div>
      </form>
    </section></div>}
    {deletingTutor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeleteTutor(); }}><section className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-labelledby="delete-tutor-title"><div className="modal-head"><div><h2 id="delete-tutor-title">Hapus tutor</h2><span className="muted">Tutor: {deletingTutor.name}</span></div><button className="close-btn" onClick={closeDeleteTutor} aria-label="Tutup" disabled={saving}>×</button></div><div className="modal-body">
      <p>Penghapusan bersifat permanen. Ketik <strong>delete</strong> untuk mengonfirmasi. Tutor yang sudah memiliki riwayat pertemuan atau laporan tidak dapat dihapus.</p>
      {deleteError && <div className="message error" role="alert">{deleteError}</div>}
      <div className="field"><label htmlFor="delete-tutor-confirmation">Ketik 'delete' di bawah</label><input id="delete-tutor-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" spellCheck={false} autoFocus disabled={saving} /></div>
      <div className="form-actions"><button className="btn ghost" onClick={closeDeleteTutor} disabled={saving}>Batal</button><button className="btn danger" onClick={() => void deleteTutor()} disabled={saving || deleteConfirmation !== "delete"}>{saving ? "Menghapus…" : "Hapus tutor"}</button></div>
    </div></section></div>}
  </div>;
}

function PageHeading({ description }: { eyebrow: string; title: string; description: string }) { return <p className="admin-page-description">{description}</p>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><div className="empty-icon"><NavIcon name="classes" /></div>{text}</div>; }

function MeetingTable({ meetings, onOpen }: { meetings: Meeting[]; onOpen: (id: string) => void }) {
  if (!meetings.length) return <div className="empty-state"><div className="empty-icon"><NavIcon name="recap" /></div>Belum ada pertemuan selesai untuk filter ini.</div>;
  return <div className="history-compact-list">{meetings.map((m) => <button type="button" className="meeting-card meeting-button history-meeting-row" key={m.id} onClick={() => onOpen(m.id)}>
    <div><div className="meeting-name">{m.class_name}</div><div className="meeting-meta"><span>{dateText(m.meeting_date)}</span><span>{m.tutor_name}</span><span>{submittedTime(m.submitted_at)}</span></div></div>
    <div className="history-row-actions"><span className="status ok">Selesai</span><span aria-hidden="true" className="history-row-arrow">›</span></div>
  </button>)}</div>;
}

function MeetingModal({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label="Detail pertemuan">
    <div className="modal-head"><div><div className="eyebrow" style={{ color: "var(--teal)" }}>Laporan pertemuan</div><h2>{detail.meeting.class_name} · Pertemuan {detail.meeting.meeting_number}</h2><span className="muted">{dateText(detail.meeting.meeting_date)}</span></div><button className="close-btn" onClick={onClose} aria-label="Tutup">×</button></div>
    <div className="modal-body">
      <div className="message info">{submittedTime(detail.meeting.submitted_at)}</div>
      <div className="two-col">
        <div className="callout"><strong>Check-in tutor</strong><br />{detail.checkin ? <><strong>{detail.checkin.location_label || "Nama lokasi tidak tersedia"}</strong>{detail.checkin.location_label && <span className="table-muted">Nama area perkiraan</span>}{new Date(detail.checkin.checked_in_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · akurasi ±{Math.round(detail.checkin.accuracy_m)} m{detail.checkin.distance_m !== null ? ` · ${Math.round(detail.checkin.distance_m)} m dari kelas` : ""}<br /><a href={`https://www.google.com/maps?q=${detail.checkin.latitude},${detail.checkin.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", fontWeight: 700 }}>Lihat titik di peta ↗</a></> : "Tutor belum check-in."}</div>
        <div className="callout"><strong>Kehadiran siswa</strong><br />{detail.students.filter((s) => s.status === "present").length} hadir · {detail.students.filter((s) => s.status !== "present").length} tidak hadir dari {detail.students.length} siswa</div>
      </div>
      <div className="card-heading" style={{ marginTop: 22 }}><div><h3>Daftar siswa</h3><p>Status absensi yang disimpan tutor.</p></div></div>
      {detail.students.length ? <div>{detail.students.map((s) => <div className="evidence-item" key={s.id}><span><strong>{s.name}</strong>{s.reason && <span className="table-muted">{s.reason}</span>}</span><span className={`status ${s.status === "present" ? "ok" : "wait"}`}>{attendanceLabel(s.status)}</span></div>)}</div> : <Empty text="Pertemuan disimpan tanpa daftar siswa." />}
      <div className="card-heading" style={{ marginTop: 22 }}><div><h3>Dokumentasi</h3><p>File yang dikirim tutor ke Google Drive.</p></div></div>
      {detail.evidence.length ? <div className="evidence-list">{detail.evidence.map((file) => <div className="evidence-item" key={file.id}><span><strong>{file.name}</strong><span className="table-muted">{new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(file.size_bytes / 1024)} KB · {new Date(file.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</span></span>{file.web_view_link ? <a className="btn secondary small" href={file.web_view_link} target="_blank" rel="noreferrer">Buka Drive ↗</a> : <span className="muted">Tersimpan</span>}</div>)}</div> : <Empty text="Belum ada dokumentasi." />}
    </div>
  </section></div>;
}

function attendanceLabel(status: string) { return status === "present" ? "Hadir" : status === "absent" ? "Alpa" : status === "sick" ? "Sakit" : "Izin"; }
