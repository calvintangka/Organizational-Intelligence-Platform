/**
 * Helpers for HTML datetime-local values.
 *
 * datetime-local has no timezone in its value.  Keep that local wall-clock
 * time until it is deliberately serialized for the API; slicing an ISO UTC
 * string would otherwise shift the default shown to the user.
 */
export function formatLocalDateTimeInput(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function serializeLocalDateTimeInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("A valid occurrence date and time are required.");

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hour ||
    localDate.getMinutes() !== minute
  ) {
    throw new Error("The occurrence date and time are not valid.");
  }
  return localDate.toISOString();
}
