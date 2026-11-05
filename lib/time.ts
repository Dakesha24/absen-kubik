export function parseJakartaDateTime(value: string) {
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) normalized = `${value}:00+07:00`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) normalized = `${value}+07:00`;
  return new Date(normalized);
}

export function jakartaCalendar(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const date = part("year") + "-" + part("month") + "-" + part("day");
  return { date, weekday: new Date(date + "T00:00:00Z").getUTCDay() };
}

export function submittedTime(value: string | null) {
  if (!value) return "Waktu pengiriman tidak tersedia";
  return `Dikirim ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB`;
}
