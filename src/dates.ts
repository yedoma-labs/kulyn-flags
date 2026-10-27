export const DAY_MS = 86_400_000;

/**
 * `YYYY-MM-DD`, optionally followed by `T HH:MM[:SS[.fraction]]` and a mandatory timezone.
 * Only fixed quantifiers and a single optional group, so matching is linear.
 */
const ISO_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}))?$/;

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
	const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return days[month - 1] ?? 0;
}

/**
 * Parses a strict ISO 8601 date or date-time and returns epoch milliseconds.
 * Returns `undefined` for anything that is not a real calendar date and time.
 */
export function parseIsoDate(value: unknown): number | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const match = ISO_PATTERN.exec(value);
	if (match === null) {
		return undefined;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
		return undefined;
	}

	if (match[4] !== undefined) {
		const hours = Number(match[4]);
		const minutes = Number(match[5]);
		const seconds = match[6] === undefined ? 0 : Number(match[6]);
		if (hours > 23 || minutes > 59 || seconds > 59) {
			return undefined;
		}
		const offset = match[8];
		if (offset !== undefined && offset !== "Z") {
			const offsetHours = Number(offset.slice(1, 3));
			const offsetMinutes = Number(offset.slice(4, 6));
			if (offsetHours > 23 || offsetMinutes > 59) {
				return undefined;
			}
		}
	}

	const time = Date.parse(value);
	return Number.isNaN(time) ? undefined : time;
}
