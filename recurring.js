function parseDateValue(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return { year, month, day };
}

export function todayValue(reference = new Date()) {
  return [
    reference.getFullYear(),
    String(reference.getMonth() + 1).padStart(2, "0"),
    String(reference.getDate()).padStart(2, "0"),
  ].join("-");
}

export function subtractDays(dateValue, days) {
  const { year, month, day } = parseDateValue(dateValue);
  const date = new Date(year, month - 1, day - days);
  return todayValue(date);
}

export function subtractWeeks(dateValue, weeks) {
  return subtractDays(dateValue, weeks * 7);
}

export function startOfMonth(dateValue) {
  const { year, month } = parseDateValue(dateValue);
  return [year, String(month).padStart(2, "0"), "01"].join("-");
}

export function startOfWeek(dateValue) {
  const { year, month, day } = parseDateValue(dateValue);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return todayValue(date);
}

export function addDays(dateValue, days) {
  const { year, month, day } = parseDateValue(dateValue);
  const date = new Date(year, month - 1, day + days);
  return todayValue(date);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsFromAnchor(anchorValue, monthsOffset) {
  const { year, month, day } = parseDateValue(anchorValue);
  const targetMonthIndex = month - 1 + monthsOffset;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = daysInMonth(targetYear, normalizedMonthIndex);
  const targetDay = Math.min(day, maxDay);
  const date = new Date(targetYear, normalizedMonthIndex, targetDay);
  return todayValue(date);
}

export function addMonths(dateValue, months) {
  return addMonthsFromAnchor(dateValue, months);
}

function isBeforeOrEqual(left, right) {
  return left <= right;
}

export function compareExpenses(left, right) {
  const dateDiff = right.date.localeCompare(left.date);
  if (dateDiff !== 0) return dateDiff;

  const leftPriority = left.sourceType === "recurring" ? 1 : 0;
  const rightPriority = right.sourceType === "recurring" ? 1 : 0;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const createdLeft = left.createdAt || "";
  const createdRight = right.createdAt || "";
  return createdRight.localeCompare(createdLeft);
}

function nextOccurrenceDate(plan, currentDate) {
  if (plan.frequency === "daily") {
    return addDays(currentDate, 1);
  }
  if (plan.frequency === "weekly") {
    return addDays(currentDate, 7);
  }
  return addMonthsFromAnchor(plan.startDate, monthsBetween(plan.startDate, currentDate) + 1);
}

function monthsBetween(left, right) {
  const a = parseDateValue(left);
  const b = parseDateValue(right);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function expandRecurringPlan(plan, rangeStart, rangeEnd) {
  if (!plan.active) {
    return [];
  }

  if (plan.endDate && plan.endDate < rangeStart) {
    return [];
  }

  if (plan.startDate > rangeEnd) {
    return [];
  }

  const occurrences = [];
  const effectiveEnd = plan.endDate && plan.endDate < rangeEnd ? plan.endDate : rangeEnd;

  if (plan.frequency === "monthly") {
    let monthIndex = Math.max(0, monthsBetween(plan.startDate, rangeStart) - 1);
    let current = addMonthsFromAnchor(plan.startDate, monthIndex);
    while (current < rangeStart) {
      monthIndex += 1;
      current = addMonthsFromAnchor(plan.startDate, monthIndex);
    }

    while (isBeforeOrEqual(current, effectiveEnd)) {
      occurrences.push(buildOccurrence(plan, current));
      monthIndex += 1;
      current = addMonthsFromAnchor(plan.startDate, monthIndex);
    }

    return occurrences;
  }

  let current = plan.startDate;
  while (current < rangeStart) {
    current = nextOccurrenceDate(plan, current);
  }

  while (isBeforeOrEqual(current, effectiveEnd)) {
    occurrences.push(buildOccurrence(plan, current));
    current = nextOccurrenceDate(plan, current);
  }

  return occurrences;
}

export function buildOccurrence(plan, date) {
  return {
    id: `${plan.id}:${date}`,
    sourceId: plan.id,
    sourceType: "recurring",
    entryType: "expense",
    date,
    amountCents: plan.amountCents,
    category: plan.category,
    note: plan.note || `${plan.frequency} recurring expense`,
    frequency: plan.frequency,
    active: plan.active,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    kind: "generated",
  };
}

export function buildCombinedExpenses(manualExpenses, recurringPlans, rangeStart, rangeEnd) {
  const generated = recurringPlans.flatMap((plan) => expandRecurringPlan(plan, rangeStart, rangeEnd));
  return [...manualExpenses, ...generated].sort(compareExpenses);
}
