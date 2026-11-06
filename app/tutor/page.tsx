"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { NavIcon, type NavIconName } from "@/components/nav-icon";
import TutorAvatar from "@/components/tutor-avatar";
import LocationComparisonMap from "@/components/location-comparison-map";
import { jakartaCalendar, submittedTime } from "@/lib/time";
import TutorClassPicker, { type TutorClassOption } from "@/components/tutor-class-picker";
import PasswordChangeDialog from "@/components/password-change-dialog";

type Meeting = { id: string; meeting_number: number; meeting_date: string; starts_at: string | null; scheduled_end_time: string | null; submitted_at: string | null; status: string; class_id: string; class_name: string };
type TutorClass = TutorClassOption;
type Student = { id: string; name: string; status: "present" | "absent" | "sick" | "permission"; reason: string | null };
type Evidence = { id: string; name: string; mime_type: string; size_bytes: number; web_view_link: string | null; created_at: string };
type Detail = { meeting: { id: string; class_name: string; meeting_number: number; meeting_date: string; submitted_at: string | null; status: string; class_latitude: number | null; class_longitude: number | null; radius_m: number | null }; students: Student[]; checkin: null | { latitude: number; longitude: number }; evidence: Evidence[] };
type GeoPoint = { latitude: number; longitude: number };
type ApiFailure = Error & { status?: number; payload?: { code?: string } };
type TutorTab = "riwayat" | "presensi" | "profil";
const attendanceOptions = [
  { short: "H", label: "Hadir", status: "present" },
  { short: "S", label: "Sakit", status: "sick" },
  { short: "I", label: "Izin", status: "permission" },
  { short: "A", label: "Alpha", status: "absent" },
] as const;
const maxVideoBytes = 100 * 1024 * 1024;
const driveUploadChunkBytes = 4 * 1024 * 1024;
const tutorNavigation: Array<{ id: TutorTab; label: string; icon: NavIconName }> = [
  { id: "riwayat", label: "Rekap Absensi", icon: "recap" },
  { id: "presensi", label: "Presensi", icon: "presence" },
  { id: "profil", label: "Profil", icon: "profile" },
];

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === "ACCOUNT_DISABLED") {
      window.location.replace("/?session=disabled");
    } else if (response.status === 401 && data.code === "SESSION_REQUIRED") {
      window.location.replace("/?session=expired");
    }
    const failure = new Error(data.error || "Permintaan gagal.") as ApiFailure;
    failure.status = response.status;
    failure.payload = data;
    throw failure;
  }
  return data;
}

function dateText(value: string) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}
function schoolName(className: string) {
  const parts = className.split(/\s+[—–]\s+/);
  return parts.length > 1 ? parts[0] : "Sekolah lainnya";
}
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function defaultRecapPeriod(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - (day >= 27 ? 1 : 2), 27));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 26));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function recapDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${date}T00:00:00+07:00`));
}

function TeachingRecapDialog({ meetings, userName, today, onClose }: { meetings: Meeting[]; userName: string; today: string; onClose: () => void }) {
  const [period, setPeriod] = useState(() => defaultRecapPeriod(today));
  const [copyMessage, setCopyMessage] = useState("");
  const [editedText, setEditedText] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]') || []);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  const valid = Boolean(period.start && period.end && period.start <= period.end);
  const selected = valid ? meetings.filter((meeting) => meeting.meeting_date >= period.start && meeting.meeting_date <= period.end).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date) || (a.starts_at || "").localeCompare(b.starts_at || "") || a.class_name.localeCompare(b.class_name, "id")) : [];
  const generatedText = valid ? `REKAP MENGAJAR (${recapDate(period.start)} - ${recapDate(period.end)})\n${userName}\n\n${selected.length ? selected.map((meeting, index) => `${index + 1}. ${dateText(`${meeting.meeting_date}T00:00:00+07:00`)} - ${meeting.class_name}${meeting.starts_at ? ` (${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(meeting.starts_at))}${meeting.scheduled_end_time ? ` - ${meeting.scheduled_end_time.slice(0, 5).replace(":", ".")} WIB` : " WIB, jam selesai belum tersedia"})` : " (jadwal jam belum tersedia)"}`).join("\n") : "Belum ada pertemuan selesai pada periode ini."}` : "";
  const text = editedText ?? generatedText;
  async function copyRecap() {
    try { await navigator.clipboard.writeText(text); setCopyMessage("Rekap berhasil disalin."); }
    catch { setCopyMessage("Gagal menyalin otomatis. Pilih teks rekap lalu salin secara manual."); }
  }
  return <div className="modal-backdrop history-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal history-dialog teaching-recap-dialog" role="dialog" aria-modal="true" aria-labelledby="teaching-recap-title">
      <div className="modal-head"><div><h2 id="teaching-recap-title">Rekap Mengajar</h2><p>Pilih periode untuk membuat rekap.</p></div><button ref={close} type="button" className="close-btn" onClick={onClose} aria-label="Tutup rekap mengajar">×</button></div>
      <div className="modal-body"><div className="teaching-recap-period"><div className="teaching-recap-section-heading"><strong>Periode rekap</strong><span>Sesuaikan tanggal</span></div><div className="teaching-recap-dates">
        <div className="field"><label htmlFor="recap-start">Dari tanggal</label><input id="recap-start" type="date" value={period.start} onChange={(event) => { setPeriod({ ...period, start: event.target.value }); setEditedText(null); setCopyMessage(""); }} /></div>
        <div className="field"><label htmlFor="recap-end">Sampai tanggal</label><input id="recap-end" type="date" value={period.end} onChange={(event) => { setPeriod({ ...period, end: event.target.value }); setEditedText(null); setCopyMessage(""); }} /></div>
      </div></div>
      {!valid && <p className="teaching-recap-error" role="alert">Pilih tanggal awal dan akhir yang valid. Tanggal akhir tidak boleh sebelum tanggal awal.</p>}
      <div className="field teaching-recap-preview"><div className="teaching-recap-section-heading"><label htmlFor="recap-text">Teks rekap</label>{valid && <span className="teaching-recap-count">{selected.length} pertemuan</span>}</div><textarea id="recap-text" value={text} onChange={(event) => { setEditedText(event.target.value); setCopyMessage(""); }} rows={10} placeholder="Pilih periode untuk melihat rekap." /><span className="field-help">Teks dapat diedit. Mengubah periode akan membuat ulang teks rekap.</span><span className="field-help">Jam selesai mengikuti jadwal kelas saat ini jika sesuai dengan waktu mulai pertemuan; periksa kembali jika jadwal pernah berubah.</span></div>
      {copyMessage && <p className="teaching-recap-feedback" role="status">{copyMessage}</p>}
      <div className="teaching-recap-actions"><button type="button" className="btn secondary" disabled={!valid} onClick={() => void copyRecap()}><NavIcon name="copy" />Salin</button>{valid ? <a className="btn" href={`https://wa.me/6283133734323?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><NavIcon name="send" />Kirim ke Bu Yuli</a> : <button type="button" className="btn" disabled><NavIcon name="send" />Kirim ke Bu Yuli</button>}</div>
      <p className="teaching-recap-note">WhatsApp akan terbuka dengan pesan yang siap diperiksa dan dikirim.</p></div>
    </section>
  </div>;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function osmMapEmbedUrl(latitude: number, longitude: number, precision = 3) {
  const mapLatitude = Number(latitude.toFixed(precision));
  const mapLongitude = Number(longitude.toFixed(precision));
  const latDelta = 0.006;
  const lonDelta = 0.008;
  const bbox = [mapLongitude - lonDelta, mapLatitude - latDelta, mapLongitude + lonDelta, mapLatitude + latDelta].join(",");
  const params = new URLSearchParams({ bbox, layer: "mapnik", marker: `${mapLatitude},${mapLongitude}` });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

function LocationMapPlaceholder({ tracking }: { tracking: boolean }) {
  return <div className={`location-map-empty ${tracking ? "is-tracking" : ""}`} role={tracking ? "status" : undefined} aria-live={tracking ? "polite" : undefined} aria-hidden={tracking ? undefined : true}>
    <svg viewBox="0 0 640 220" preserveAspectRatio="none"><path d="M-30 173C92 158 126 43 250 66s141 116 420 58" /><path d="M139-24c4 67 100 73 119 135s-16 80 23 133" /><path d="M507-31c-30 70-99 91-76 150s75 67 84 126" /><path d="M-20 45c98 34 185-7 274-15s197 52 431 19" /></svg>
    <span className="location-empty-orbit" /><span className="location-empty-pin"><NavIcon name="location" /></span>
    {tracking && <span className="tracking-caption"><span className="tracking-spinner" /><span>Sedang melacak lokasi</span><span className="tracking-dots" aria-hidden="true"><i /><i /><i /></span></span>}
  </div>;
}

function LocationMap({ latitude, longitude, title, precision = 3 }: { latitude: number; longitude: number; title: string; precision?: number }) {
  return <div className="location-map-frame"><iframe title={title} src={osmMapEmbedUrl(latitude, longitude, precision)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>;
}

function EvidenceItem({ file, meetingId, onDelete, deleting, disabled }: { file: Evidence; meetingId: string; onDelete?: () => void; deleting?: boolean; disabled?: boolean }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.mime_type);
  return <div className="evidence-item evidence-preview-item">
    {isImage && (previewFailed ? <div className="evidence-preview-unavailable">Pratinjau foto tidak tersedia</div> : <img className="evidence-preview-image" src={`/api/meetings/${encodeURIComponent(meetingId)}/evidence/${encodeURIComponent(file.id)}/preview`} alt={`Pratinjau ${file.name}`} loading="lazy" onError={() => setPreviewFailed(true)} />)}
    <div className="evidence-preview-info"><span><strong>{file.name}</strong><span className="table-muted">{formatFileSize(file.size_bytes)}</span></span><div className="evidence-preview-actions">{file.web_view_link && <a className="btn ghost small" href={file.web_view_link} target="_blank" rel="noreferrer">Drive ↗</a>}{onDelete && <button type="button" className="btn ghost small evidence-delete" onClick={onDelete} disabled={disabled} aria-label={`Hapus ${file.name}`}><NavIcon name="trash" />{deleting ? "Menghapus…" : "Hapus"}</button>}</div></div>
  </div>;
}

function AttendanceSuccessDialog({ onClose, onHistory }: { onClose: () => void; onHistory: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop password-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="password-dialog attendance-success-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-success-title" aria-describedby="attendance-success-description">
      <button ref={close} type="button" className="password-dialog-close" onClick={onClose} aria-label="Tutup">×</button>
      <div className="password-dialog-icon is-success" aria-hidden="true"><svg viewBox="0 0 64 64"><circle className="password-success-ring" cx="32" cy="32" r="26" /><path className="password-success-check" d="m19 33 9 9 18-20" /></svg></div>
      <h2 id="attendance-success-title">Absensi berhasil tersimpan</h2>
      <p id="attendance-success-description">Dokumentasi dapat dilihat di folder Google Drive ABSEN-KUBIK.</p>
      <div className="attendance-success-actions"><a className="btn secondary" href="https://drive.google.com/drive/folders/1e8unx2h7qwGmcxtQvsa_7FbJbvoY1-tJ?usp=sharing" target="_blank" rel="noreferrer">Buka Google Drive ↗</a><button type="button" className="btn" onClick={onHistory}>Lihat rekap absensi</button></div>
    </section>
  </div>;
}

function HistoryDialog({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], iframe') || []);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop history-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title">
      <div className="modal-head"><div><h2 id="history-dialog-title">Detail Absensi</h2><p>{detail.meeting.class_name}</p><p>{dateText(detail.meeting.meeting_date)}</p></div><button ref={close} type="button" className="close-btn" onClick={onClose} aria-label="Tutup detail absensi">×</button></div>
      <div className="modal-body">
        <div className="message success">Presensi sudah dikirim. {submittedTime(detail.meeting.submitted_at)}.</div>
        <section className="history-detail-section"><h3>Lokasi check-in</h3>{detail.checkin ? <LocationMap latitude={detail.checkin.latitude} longitude={detail.checkin.longitude} title="Peta lokasi check-in" /> : <p className="history-detail-empty">Lokasi check-in tidak tersedia.</p>}</section>
        <section className="history-detail-section"><h3>Dokumentasi</h3>{detail.evidence.length ? <div className="evidence-list">{detail.evidence.map((file) => <EvidenceItem key={file.id} file={file} meetingId={detail.meeting.id} />)}</div> : <p className="history-detail-empty">Tidak ada dokumentasi.</p>}</section>
        <section className="history-detail-section"><h3>Daftar hadir <span>({detail.students.length} siswa)</span></h3>{detail.students.length ? <div className="history-students">{detail.students.map((student) => <div className="history-student" key={student.id}><div><strong>{student.name}</strong>{student.reason && <span>{student.reason}</span>}</div><span className={`status ${student.status === "present" ? "ok" : "wait"}`}>{attendanceOptions.find((option) => option.status === student.status)?.label || student.status}</span></div>)}</div> : <p className="history-detail-empty">Tidak ada siswa dalam pertemuan ini.</p>}</section>
      </div>
    </section>
  </div>;
}

async function compressedImage(file: File) {
  if (!file.type.startsWith("image/") || file.size <= 2.7 * 1024 * 1024) return file;
  if (typeof createImageBitmap === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export default function TutorPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [classDay, setClassDay] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [historySchool, setHistorySchool] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);
  const [teachingRecapOpen, setTeachingRecapOpen] = useState(false);
  const [userName, setUserName] = useState("Tutor");
  const [hasPassword, setHasPassword] = useState(false);
  const [dismissedPasswordNoticeTabs, setDismissedPasswordNoticeTabs] = useState<TutorTab[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<"confirm" | "success" | null>(null);
  const [passwordDialogError, setPasswordDialogError] = useState("");
  const [passwordFormError, setPasswordFormError] = useState("");
  const [activeTab, setActiveTab] = useState<TutorTab>("presensi");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trackingLocation, setTrackingLocation] = useState(false);
  const [locationIssue, setLocationIssue] = useState(false);
  const [outsideLocation, setOutsideLocation] = useState<GeoPoint | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [result, me] = await Promise.all([request("/api/tutor/meetings"), request("/api/auth/me")]);
      setMeetings(result.meetings || []);
      setClasses(result.classes || []);
      setClassDay(result.date || jakartaCalendar().date);
      setUserName(me.user?.name || "Tutor");
      setHasPassword(Boolean(me.user?.hasPassword));
      setError("");
    } catch (err) {
      const failure = err as ApiFailure;
      const message = err instanceof Error ? err.message : "Gagal memuat data.";
      if (failure.payload?.code === "SESSION_REQUIRED" || failure.payload?.code === "ACCOUNT_DISABLED") return;
      if (failure.status === 403) router.replace("/");
      else setError(message);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const checkSession = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [load]);
  useEffect(() => {
    if (!classDay) return;
    const nextMidnight = new Date(classDay + "T00:00:00+07:00").getTime() + 24 * 60 * 60 * 1000;
    const timer = window.setTimeout(() => { void load(); }, Math.max(1000, nextMidnight - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [classDay, load]);
  const unscheduledClasses = classes.filter((item) => item.weekday == null);
  const completed = useMemo(() => meetings.filter((m) => m.status === "completed"), [meetings]);
  const currentDate = classDay || jakartaCalendar().date;
  const selectedMonth = historyMonth || currentDate.slice(5, 7);
  const selectedYear = historyYear || currentDate.slice(0, 4);
  const historyYears = Array.from(new Set([currentDate.slice(0, 4), ...Array.from({ length: 5 }, (_, index) => String(Number(currentDate.slice(0, 4)) - index - 1)), ...completed.map((meeting) => meeting.meeting_date.slice(0, 4))])).sort((a, b) => b.localeCompare(a));
  const historySchools = Array.from(new Set(completed.map((meeting) => schoolName(meeting.class_name)))).sort((a, b) => a.localeCompare(b, "id"));
  const visibleMeetings = completed.filter((meeting) => meeting.meeting_date.slice(0, 7) === selectedYear + "-" + selectedMonth && (!historySchool || schoolName(meeting.class_name) === historySchool));
  const activeHeader = activeTab === "riwayat"
    ? { src: "/images/header-rekap-absensi.png", width: 2172, height: 724 }
    : activeTab === "profil"
      ? { src: "/images/header-website-profile.jpg", width: 1777, height: 538 }
      : { src: "/images/header-website-attend.jpg", width: 1765, height: 528 };
  const showPasswordNotice = !hasPassword && activeTab !== "profil" && !dismissedPasswordNoticeTabs.includes(activeTab);
  const schoolGeofenceReady = Boolean(detail && detail.meeting.class_latitude !== null && detail.meeting.class_longitude !== null && detail.meeting.radius_m !== null);
  const schoolLocation = detail && detail.meeting.class_latitude !== null && detail.meeting.class_longitude !== null
    ? { latitude: detail.meeting.class_latitude, longitude: detail.meeting.class_longitude }
    : null;

  async function openMeeting(meeting: Meeting) {
    setBusy(true); setLocationIssue(false); setOutsideLocation(null); setError(""); setUploadError(""); setMessage("");
    try { setDetail(await request(`/api/meetings/${meeting.id}`)); }
    catch (err) { if (activeTab === "presensi") setSelectedClassId(""); setError(err instanceof Error ? err.message : "Gagal membuka pertemuan."); }
    finally { setBusy(false); }
  }

  const closeHistory = useCallback(() => setDetail(null), []);
  const closeTeachingRecap = useCallback(() => setTeachingRecapOpen(false), []);
  const closeAttendanceSuccess = useCallback(() => setAttendanceSuccess(false), []);

  async function chooseClass(classId: string, newMeeting = false) {
    setSelectedClassId(classId);
    setUploadError("");
    setDetail(null);
    setLocationIssue(false);
    setOutsideLocation(null);
    if (!classId) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("/api/tutor/meetings", "POST", { classId, newMeeting });
      setDetail(await request(`/api/meetings/${result.meeting.id}`));
    } catch (err) {
      setSelectedClassId("");
      setError(err instanceof Error ? err.message : "Gagal membuka presensi kelas.");
    } finally { setBusy(false); }
  }

  function updateStudent(studentId: string, key: "status" | "reason", value: string) {
    setDetail((current) => {
      if (!current) return current;
      return { ...current, students: current.students.map((student) => {
        if (student.id !== studentId) return student;
        return key === "status" ? { ...student, status: value as Student["status"] } : { ...student, reason: value };
      }) };
    });
  }

  async function checkIn() {
    if (!detail) return;
    if (!navigator.geolocation) { setLocationIssue(false); setOutsideLocation(null); setError("Browser ini tidak mendukung akses lokasi."); return; }
    let detectedLocation: GeoPoint | null = null;
    setBusy(true); setTrackingLocation(true); setLocationIssue(false); setOutsideLocation(null); setError(""); setMessage("");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      detectedLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const result = await request(`/api/meetings/${detail.meeting.id}/checkin`, "POST", {
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      });
      setDetail((current) => current ? { ...current, checkin: result.checkin } : current);
      setMessage("");
      await load();
    } catch (err) {
      const geo = err as GeolocationPositionError;
      const failure = err as ApiFailure;
      if (failure.payload?.code === "OUTSIDE_SCHOOL_RADIUS") {
        setLocationIssue(true);
        setOutsideLocation(detectedLocation);
        setError("");
      }
      else if (typeof geo.code === "number") setError(geo.code === 1 ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser untuk check-in." : geo.code === 3 ? "Pengambilan lokasi terlalu lama. Coba lagi di area terbuka." : "Lokasi perangkat belum tersedia. Periksa GPS dan koneksi internet.");
      else setError(err instanceof Error ? err.message : "Gagal melakukan check-in.");
    } finally { setBusy(false); setTrackingLocation(false); }
  }

  async function submitAttendance() {
    if (!detail) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`/api/meetings/${detail.meeting.id}/complete`, "POST", { records: detail.students.map((s) => ({ studentId: s.id, status: s.status, reason: s.status === "present" ? "" : s.reason || "" })) });
      setHistoryMonth(detail.meeting.meeting_date.slice(5, 7));
      setHistoryYear(detail.meeting.meeting_date.slice(0, 4));
      setHistorySchool("");
      setSelectedClassId("");
      setDetail(null);
      setAttendanceSuccess(true);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengirim presensi."); }
    finally { setBusy(false); }
  }

  function confirmPasswordSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordFormError(""); setError(""); setMessage("");
    if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) { setPasswordFormError("Kata sandi baru minimal 12 karakter dan maksimal 72 byte."); return; }
    if (newPassword !== confirmPassword) { setPasswordFormError("Konfirmasi kata sandi belum sama."); return; }
    if (newPassword === currentPassword) { setPasswordFormError("Gunakan kata sandi baru yang berbeda."); return; }
    setPasswordDialogError("");
    setPasswordDialog("confirm");
  }
  function closePasswordDialog() {
    if (passwordSaving) return;
    setPasswordDialog(null);
    setPasswordDialogError("");
  }
  async function savePassword() {
    if (passwordSaving || passwordDialog !== "confirm") return;
    setPasswordSaving(true); setPasswordDialogError("");
    try {
      await request("/api/tutor/password", "POST", { currentPassword, newPassword, confirmPassword });
      setHasPassword(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordDialog("success");
    } catch (err) { setPasswordDialogError(err instanceof Error ? err.message : "Gagal menyimpan kata sandi."); }
    finally { setPasswordSaving(false); }
  }

  async function uploadFiles(files: FileList | null) {
    if (!detail || !files?.length) return;
    setUploadBusy(true); setError(""); setUploadError(""); setMessage("");
    try {
      const selectedFiles = Array.from(files);
      const totalBytes = selectedFiles.reduce((total, file) => total + file.size, 0);
      let completedBytes = 0;
      setUploadProgress(0);
      for (const original of selectedFiles) {
        if (original.type.startsWith("video/")) {
          if (original.size > maxVideoBytes) throw new Error(`${original.name} melebihi batas 100 MB per video.`);
          if (!["video/mp4", "video/webm", "video/quicktime"].includes(original.type)) throw new Error("Format video yang didukung: MP4, MOV, dan WebM.");
          await uploadVideo(original, detail.meeting.id, (fraction) => {
            setUploadProgress(Math.min(100, Math.round(((completedBytes + original.size * fraction) / totalBytes) * 100)));
          });
        } else {
          const file = await compressedImage(original);
          if (file.size > 3 * 1024 * 1024) throw new Error(`${original.name} masih lebih dari 3 MB setelah kompresi.`);
          const form = new FormData(); form.set("file", file);
          const response = await fetch(`/api/meetings/${detail.meeting.id}/evidence`, { method: "POST", body: form });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || `Gagal mengunggah ${original.name}.`);
        }
        completedBytes += original.size;
        setUploadProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)));
      }
      const refreshed = await request(`/api/meetings/${detail.meeting.id}`);
      setDetail(refreshed); setMessage("Dokumentasi berhasil diunggah ke Google Drive."); await load();
    } catch (err) { setUploadError(err instanceof Error ? err.message : "Gagal mengunggah dokumentasi."); }
    finally { setUploadBusy(false); setUploadProgress(0); }
  }

  async function deleteEvidence(file: Evidence) {
    if (!detail || deletingEvidenceId || uploadBusy || busy) return;
    const meetingId = detail.meeting.id;
    setDeletingEvidenceId(file.id); setUploadError("");
    try {
      const result = await request(`/api/meetings/${meetingId}/evidence/${file.id}`, "DELETE");
      setDetail((current) => current?.meeting.id === meetingId ? { ...current, evidence: current.evidence.filter((item) => item.id !== file.id) } : current);
      if (result.warning) setUploadError(result.warning);
    } catch (err) { setUploadError(err instanceof Error ? err.message : "Gagal menghapus dokumentasi."); }
    finally { setDeletingEvidenceId(null); }
  }

  async function uploadVideo(file: File, meetingId: string, onProgress: (fraction: number) => void) {
    const endpoint = `/api/meetings/${meetingId}/evidence/resumable`;
    const initResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init", name: file.name, mimeType: file.type, size: file.size }),
      cache: "no-store",
    });
    const initResult = await initResponse.json().catch(() => ({}));
    if (!initResponse.ok || !initResult.sessionUrl) throw new Error(initResult.error || `Gagal menyiapkan unggahan ${file.name}.`);

    let start = 0;
    let driveFileId = "";
    while (start < file.size) {
      const end = Math.min(start + driveUploadChunkBytes, file.size);
      const response = await fetch(initResult.sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
        },
        body: file.slice(start, end),
      });
      if (response.status === 308) {
        const acceptedRange = response.headers.get("Range");
        const acceptedThrough = acceptedRange?.match(/bytes=0-(\d+)/)?.[1];
        start = acceptedThrough ? Number(acceptedThrough) + 1 : end;
        onProgress(Math.min(1, start / file.size));
        continue;
      }
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.id) throw new Error(uploaded.error?.message || `Gagal mengunggah ${file.name} ke Google Drive.`);
      driveFileId = uploaded.id;
      start = file.size;
      onProgress(1);
    }
    if (!driveFileId) throw new Error(`Google Drive belum menyelesaikan unggahan ${file.name}.`);

    const completeResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", fileId: driveFileId }),
      cache: "no-store",
    });
    const completeResult = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) throw new Error(completeResult.error || `Video ${file.name} sudah diunggah, tetapi gagal dicatat pada presensi.`);
  }

  async function logout() {
    if (!window.confirm("Apakah Anda yakin ingin keluar dari akun?")) return;
    await request("/api/auth/logout", "POST");
    router.replace("/");
  }

  if (loading) return <main className="tutor-loading-screen" aria-live="polite" aria-busy="true">
    <section className="tutor-loading-card">
      <div className="tutor-loading-brand"><Image className="tutor-loading-logo" src="/images/logo-kubik.jpg" alt="Logo Kubik" width={1080} height={1440} /><span>ABSEN-KUBIK</span></div>
      <div className="tutor-loading-art" aria-hidden="true"><div className="tutor-loading-orbit" /><div className="tutor-loading-center"><NavIcon name="presence" /></div><span className="tutor-loading-spark spark-one" /><span className="tutor-loading-spark spark-two" /><span className="tutor-loading-spark spark-three" /></div>
      <div className="tutor-loading-copy"><span className="tutor-loading-kicker"><span /> MENYIAPKAN PRESENSI</span><p>Kami sedang menyiapkan kelas dan daftar siswa Anda.</p></div>
      <div className="tutor-loading-progress" role="progressbar" aria-label="Memuat data presensi"><span /></div>
    </section>
  </main>;

  return <div className="app-shell tutor-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span className="brand-symbol">K</span><span>ABSEN-KUBIK</span></div>
      <div className="nav-label">Ruang tutor</div>
      <nav className="nav-list" aria-label="Navigasi tutor">{tutorNavigation.map((item) => <button key={item.id} className={`nav-item ${activeTab === item.id ? "active" : ""}`} aria-label={item.label} aria-current={activeTab === item.id ? "page" : undefined} onClick={() => { setActiveTab(item.id); setDetail(null); setSelectedClassId(""); setLocationIssue(false); setOutsideLocation(null); setError(""); setMessage(""); }}><span className="nav-icon"><NavIcon name={item.icon} /></span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-chip"><TutorAvatar name={userName} className="avatar tutor-photo" size={34} /><div className="user-copy"><strong>{userName}</strong><span>Tutor</span></div></div><button className="btn" onClick={logout}><span>↪</span> Keluar dari akun</button></div>
    </aside>
    <main className="main-area">
      <div className="content">
        <section className="tutor-hero-card" aria-label="Header Kubikcode">
          <Image className="tutor-hero-image" src={activeHeader.src} alt={`Header ${activeTab === "riwayat" ? "Rekap Absensi" : activeTab}`} width={activeHeader.width} height={activeHeader.height} priority />
        </section>
        {showPasswordNotice && <div className="password-notice" role="status"><span>Kata sandi belum diatur.</span><button type="button" className="password-notice-action" onClick={() => { setActiveTab("profil"); setDetail(null); setSelectedClassId(""); setError(""); setMessage(""); }}>Atur di Profil</button><button type="button" className="password-notice-close" aria-label="Tutup pemberitahuan" onClick={() => setDismissedPasswordNoticeTabs((tabs) => tabs.includes(activeTab) ? tabs : [...tabs, activeTab])}>×</button></div>}
        {(error || message) && <div className={`message ${error ? "error" : "success"}`} role="status">{error || message}</div>}
        {activeTab === "profil" ? <>
          <section className="card profile-card"><div className="profile-hero"><TutorAvatar name={userName} className="profile-avatar tutor-photo" size={58} /><div><h2>{userName}</h2><span className="status ok">Tutor aktif</span></div></div><div className="profile-actions"><button className="btn danger profile-logout" onClick={() => void logout()}><NavIcon name="logout" /> Keluar dari akun</button></div></section>
          <section className="card profile-password-card">
            <div className="card-heading"><div><h2>{hasPassword ? "Ubah kata sandi" : "Atur kata sandi"}</h2><p>{hasPassword ? "Perbarui kata sandi untuk akun tutor Anda." : "Akun Anda belum memiliki kata sandi. Buat kata sandi agar sesi berikutnya lebih aman."}</p></div><span className={`status ${hasPassword ? "ok" : "wait"}`}>{hasPassword ? "Sudah diatur" : "Belum diatur"}</span></div>
            <form className="profile-password-form" onSubmit={confirmPasswordSave}>
              {passwordFormError && <div className="message error" role="alert">{passwordFormError}</div>}
              {hasPassword && <div className="field"><label htmlFor="current-password">Kata sandi saat ini</label><input id="current-password" disabled={passwordSaving} type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>}
              <div className="field"><label htmlFor="new-password">Kata sandi baru</label><input id="new-password" disabled={passwordSaving} type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><span className="field-help">Minimal 12 karakter.</span></div>
              <div className="field"><label htmlFor="confirm-password">Ulangi kata sandi baru</label><input id="confirm-password" disabled={passwordSaving} type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
              <button className="btn" type="submit" disabled={passwordSaving}>{passwordSaving ? "Menyimpan…" : hasPassword ? "Perbarui kata sandi" : "Simpan kata sandi"}</button>
            </form>
          </section>
        </> : activeTab === "riwayat" ? <>
          <section className="card history-card"><div className="card-heading"><div><h2>Rekap Absensi</h2><p>Lihat laporan presensi yang sudah disimpan.</p></div><button className="btn ghost small history-refresh" onClick={() => void load()} aria-label="Muat ulang data"><span aria-hidden="true">↻</span><span>Muat ulang</span></button></div>
            <button type="button" className="btn secondary teaching-recap-open" onClick={() => setTeachingRecapOpen(true)}><NavIcon name="recap" />Coba rekap</button>
            <div className="history-filter-grid" role="group" aria-label="Filter rekap absensi">
              <div className="field"><label htmlFor="history-month">Bulan</label><select id="history-month" value={selectedMonth} onChange={(event) => { setHistoryMonth(event.target.value); setDetail(null); }}>{monthNames.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}</select></div>
              <div className="field"><label htmlFor="history-year">Tahun</label><select id="history-year" value={selectedYear} onChange={(event) => { setHistoryYear(event.target.value); setDetail(null); }}>{historyYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
              <div className="field history-school-filter"><label htmlFor="history-school">Sekolah</label><select id="history-school" value={historySchool} onChange={(event) => { setHistorySchool(event.target.value); setDetail(null); }}><option value="">Semua sekolah</option>{historySchools.map((school) => <option key={school} value={school}>{school}</option>)}</select></div>
            </div>
            <div className="history-result-count" aria-live="polite">{visibleMeetings.length} pertemuan</div>
            {visibleMeetings.length ? <div className="history-compact-list">{visibleMeetings.map((meeting) => <button key={meeting.id} className="meeting-card meeting-button history-meeting-row" disabled={busy} onClick={() => void openMeeting(meeting)}>
              <div><div className="meeting-name">{meeting.class_name}</div><div className="meeting-meta"><span>{dateText(meeting.meeting_date)}</span><span>{submittedTime(meeting.submitted_at)}</span></div></div>
              <div className="history-row-actions"><span className="status ok">Selesai</span><span aria-hidden="true" className="history-row-arrow">›</span></div>
            </button>)}</div> : <div className="empty-state"><div className="empty-icon"><NavIcon name="recap" /></div>Belum ada pertemuan selesai untuk filter ini.</div>}
          </section>
        </> : <>
          <section className="card class-picker-card"><div className="presensi-tutor-banner" aria-label={`Presensi tutor ${userName}`}><TutorAvatar name={userName} className="presensi-tutor-avatar tutor-photo" size={42} /><div><span>Tutor</span><strong>{userName}</strong></div></div>
            <div className="class-picker-caption"><span>{classDay && dateText(classDay + "T00:00:00+07:00")}</span>{classes.length > 0 && <span className="class-picker-count">{classes.length} kelas tersedia</span>}</div>
            {classes.length ? <div className="field"><label id="class-choice-label" htmlFor="class-choice">Kelas hari ini</label><TutorClassPicker id="class-choice" labelledBy="class-choice-label" describedBy={unscheduledClasses.length ? "class-choice-note" : undefined} classes={classes} value={selectedClassId} disabled={busy || uploadBusy || Boolean(deletingEvidenceId)} onChange={(id) => void chooseClass(id)} />{unscheduledClasses.length > 0 && <span id="class-choice-note" className="field-help">Kelas tanpa jadwal tetap dapat diisi setiap hari.</span>}</div> : <div className="empty-state class-picker-empty"><div className="empty-icon"><NavIcon name="presence" /></div>Tidak ada kelas hari ini.</div>}
          </section>
        </>}
        {busy && !detail && <div className="message info">Membuka detail pertemuan…</div>}
        {detail && activeTab === "presensi" && <div className="meeting-flow" id="meeting-detail">
          <section className="card meeting-summary-card">
            <div className="meeting-summary-head"><div><h2>{detail.meeting.class_name}</h2><p>{dateText(detail.meeting.meeting_date)}</p></div><button className="btn ghost small" onClick={() => { setDetail(null); setSelectedClassId(""); setLocationIssue(false); setOutsideLocation(null); }} aria-label="Tutup pertemuan">×</button></div>
            {detail.meeting.status === "completed" && <><div className="message success">Presensi sudah dikirim. {submittedTime(detail.meeting.submitted_at)}. Dokumentasi di bawah ini berasal dari presensi tersebut.</div><button type="button" className="btn secondary new-meeting-button" disabled={busy || uploadBusy || Boolean(deletingEvidenceId)} onClick={() => void chooseClass(selectedClassId, true)}>Mulai absensi baru</button></>}
          </section>
          <section className="card presensi-step-card location-step">
            <div className="step-head"><div className="step-title"><h2>Pilih lokasi</h2></div></div>
            <div className="location-panel">
              {trackingLocation ? <LocationMapPlaceholder tracking /> : locationIssue && outsideLocation && schoolLocation ? <LocationComparisonMap school={schoolLocation} detected={outsideLocation} title="Peta lokasi sekolah dan lokasi terdeteksi" /> : detail.checkin ? <LocationMap latitude={detail.checkin.latitude} longitude={detail.checkin.longitude} title="Peta lokasi check-in" /> : schoolLocation ? <LocationMap latitude={schoolLocation.latitude} longitude={schoolLocation.longitude} title="Peta lokasi sekolah" precision={6} /> : <LocationMapPlaceholder tracking={false} />}
              <div className="location-copy">{locationIssue ? <div className="location-result outside" role="alert">Anda berada di luar jangkauan lokasi sekolah.</div> : detail.checkin ? <div className={`location-result ${schoolGeofenceReady ? "inside" : "unconfigured"}`} role="status">{schoolGeofenceReady ? "Anda berada di dalam jangkauan lokasi sekolah." : detail.meeting.class_latitude == null || detail.meeting.class_longitude == null ? "Titik sekolah belum diatur." : "Jangkauan sekolah belum diatur."}</div> : <span>Izinkan akses lokasi untuk check-in.</span>}
                {detail.meeting.status !== "completed" && <button className={`btn location-action ${trackingLocation ? "is-loading" : ""}`} aria-busy={trackingLocation} disabled={busy} onClick={() => void checkIn()}>{trackingLocation ? <span className="location-spinner" aria-hidden="true" /> : <NavIcon name="location" />}<span>{trackingLocation ? "Sedang melacak…" : detail.checkin ? "Perbarui lokasi" : "Check-in lokasi"}</span></button>}
              </div>
            </div>
          </section>
          <section className="card presensi-step-card">
            <div className="step-head"><div className="step-title"><h2>Dokumentasi</h2></div><span className={`status ${detail.evidence.length ? "ok" : "wait"}`}>{detail.evidence.length} berkas</span></div>
            <p className="step-hint">{detail.checkin ? "Foto JPG/PNG/WebP maks. 3 MB · Video MP4/MOV/WebM maks. 100 MB per video." : "Check-in lokasi dulu untuk unggah."}</p>
            {detail.meeting.status !== "completed" && <div className="documentation-upload-actions">
              <label className={`btn secondary upload-button ${uploadBusy || deletingEvidenceId || !detail.checkin ? "is-disabled" : ""}`}><NavIcon name="camera" /><span>Ambil foto</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={uploadBusy || Boolean(deletingEvidenceId) || !detail.checkin} onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = ""; }} /></label>
              <label className={`btn secondary upload-button ${uploadBusy || deletingEvidenceId || !detail.checkin ? "is-disabled" : ""}`}><NavIcon name="video" /><span>Rekam video</span><input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm" capture="environment" disabled={uploadBusy || Boolean(deletingEvidenceId) || !detail.checkin} onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = ""; }} /></label>
              <label className={`btn secondary upload-button upload-gallery-button ${uploadBusy || deletingEvidenceId || !detail.checkin ? "is-disabled" : ""}`}><NavIcon name="camera" /><span>Pilih dari galeri</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm" multiple disabled={uploadBusy || Boolean(deletingEvidenceId) || !detail.checkin} onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = ""; }} /></label>
            </div>}
            {uploadError && <div className="message error upload-error" role="alert">{uploadError}</div>}
            {uploadBusy && <><div className="upload-progress-caption">Mengunggah dokumentasi · {uploadProgress}%</div><div className="upload-progress-track" role="progressbar" aria-label="Progres unggah dokumentasi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div></>}
            {detail.evidence.length > 0 && <div className="evidence-list" style={{ marginTop: 12 }}>{detail.evidence.map((file) => <EvidenceItem key={file.id} file={file} meetingId={detail.meeting.id} onDelete={detail.meeting.status === "scheduled" ? () => void deleteEvidence(file) : undefined} deleting={deletingEvidenceId === file.id} disabled={busy || uploadBusy || Boolean(deletingEvidenceId)} />)}</div>}
          </section>
          {detail.students.length > 0 && <section className="card presensi-step-card attendance-step-card">
            <div className="step-head"><div className="step-title"><h2>Daftar hadir</h2></div><span className="student-count">{detail.students.length} siswa</span></div>
            <>
              <div className="attendance-row attendance-header"><span>Nama siswa</span><span aria-label="Hadir, Sakit, Izin, Alpha">H · S · I · A</span></div>
              {detail.students.map((student) => <div className="attendance-row attendance-student-row" key={student.id}><span className="attendance-name">{student.name}</span><div className="attendance-options" role="group" aria-label={`Kehadiran ${student.name}`}>{attendanceOptions.map((option) => <button key={option.status} type="button" className={`attendance-option ${student.status === option.status ? "selected" : ""}`} aria-label={option.label} aria-pressed={student.status === option.status} title={option.label} disabled={detail.meeting.status === "completed"} onClick={() => updateStudent(student.id, "status", option.status)}>{option.short}</button>)}</div>{student.status !== "present" && detail.meeting.status !== "completed" && <input className="attendance-reason" aria-label={`Keterangan ${student.name}`} value={student.reason || ""} onChange={(e) => updateStudent(student.id, "reason", e.target.value)} placeholder="Keterangan (opsional)" maxLength={300} />}</div>)}
            </>
          </section>}
          {detail.meeting.status !== "completed" && <section className="card presensi-submit-card"><button className="btn full submit-attendance-button" disabled={busy || uploadBusy || Boolean(deletingEvidenceId) || !detail.checkin || !detail.evidence.length} onClick={() => void submitAttendance()}>{busy ? "Menyimpan…" : <><NavIcon name="send" /> Simpan absensi</>}</button><span className="submit-hint">{!detail.checkin ? "Lokasi belum diambil" : !detail.evidence.length ? "Tambahkan foto atau video dokumentasi" : !detail.students.length ? "Kelas ini belum memiliki siswa. Lokasi dan dokumentasi dapat langsung disimpan." : "Periksa data, lalu simpan"}</span></section>}
        </div>}
      </div>
    </main>
    {teachingRecapOpen && <TeachingRecapDialog meetings={completed} userName={userName} today={currentDate} onClose={closeTeachingRecap} />}
    {attendanceSuccess && <AttendanceSuccessDialog onClose={closeAttendanceSuccess} onHistory={() => { setAttendanceSuccess(false); setActiveTab("riwayat"); setMessage(""); }} />}
    {detail && activeTab === "riwayat" && <HistoryDialog detail={detail} onClose={closeHistory} />}
    {passwordDialog && <PasswordChangeDialog phase={passwordDialog} busy={passwordSaving} error={passwordDialogError} onClose={closePasswordDialog} onConfirm={() => void savePassword()} />}
  </div>;
}
