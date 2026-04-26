import {
  DEFAULT_SETTINGS,
  replaceAllData,
  deleteExpense,
  deleteRecurring,
  getSettings,
  initDatabase,
  listExpenses,
  listRecurring,
  saveExpense,
  saveRecurring,
  saveSettings,
} from "./db.js";
import {
  addMonths,
  buildCombinedExpenses,
  compareExpenses,
  startOfMonth,
  startOfWeek,
  subtractDays,
  subtractWeeks,
  todayValue,
} from "./recurring.js";

const moneyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

const els = {
  syncStatus: document.getElementById("syncStatus"),
  installButton: document.getElementById("installButton"),
  exportButton: document.getElementById("exportButton"),
  importButton: document.getElementById("importButton"),
  exportButtonBottom: document.getElementById("exportButtonBottom"),
  importButtonBottom: document.getElementById("importButtonBottom"),
  importFile: document.getElementById("importFile"),
  todayTotal: document.getElementById("todayTotal"),
  weekTotal: document.getElementById("weekTotal"),
  monthTotal: document.getElementById("monthTotal"),
  chartYearLabel: document.getElementById("chartYearLabel"),
  yearPrev: document.getElementById("yearPrev"),
  yearNext: document.getElementById("yearNext"),
  incomeBar: document.getElementById("incomeBar"),
  expenseBar: document.getElementById("expenseBar"),
  chartIncomeLabel: document.getElementById("chartIncomeLabel"),
  chartExpenseLabel: document.getElementById("chartExpenseLabel"),
  chartBalanceLabel: document.getElementById("chartBalanceLabel"),
  chartIncomeTotal: document.getElementById("chartIncomeTotal"),
  chartExpenseTotal: document.getElementById("chartExpenseTotal"),
  chartBalanceTotal: document.getElementById("chartBalanceTotal"),
  chartTransactionsCount: document.getElementById("chartTransactionsCount"),
  chartBreakdown: document.getElementById("chartBreakdown"),
  chartTabs: Array.from(document.querySelectorAll("[data-chart-tab]")),
  activitySubtitle: document.getElementById("activitySubtitle"),
  expenseList: document.getElementById("expenseList"),
  recurringList: document.getElementById("recurringList"),
  categoryList: document.getElementById("categoryList"),
  expenseForm: document.getElementById("expenseForm"),
  expenseId: document.getElementById("expenseId"),
  expenseAmount: document.getElementById("expenseAmount"),
  expenseType: document.getElementById("expenseType"),
  expenseCategory: document.getElementById("expenseCategory"),
  expenseDate: document.getElementById("expenseDate"),
  expenseNote: document.getElementById("expenseNote"),
  expenseSubmit: document.getElementById("expenseSubmit"),
  expenseCancel: document.getElementById("expenseCancel"),
  recurringForm: document.getElementById("recurringForm"),
  recurringId: document.getElementById("recurringId"),
  recurringAmount: document.getElementById("recurringAmount"),
  recurringCategory: document.getElementById("recurringCategory"),
  recurringStart: document.getElementById("recurringStart"),
  recurringFrequency: document.getElementById("recurringFrequency"),
  recurringEnd: document.getElementById("recurringEnd"),
  recurringActive: document.getElementById("recurringActive"),
  recurringNote: document.getElementById("recurringNote"),
  recurringSubmit: document.getElementById("recurringSubmit"),
  recurringCancel: document.getElementById("recurringCancel"),
  searchInput: document.getElementById("searchInput"),
  filterCategory: document.getElementById("filterCategory"),
  filterType: document.getElementById("filterType"),
  filterSource: document.getElementById("filterSource"),
  filterRange: document.getElementById("filterRange"),
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  expenses: [],
  recurring: [],
  allCombinedExpenses: [],
  filters: {
    search: "",
    category: "all",
    type: "all",
    source: "all",
    range: "30",
  },
  chart: {
    tab: "income",
    year: new Date().getFullYear(),
    years: [],
  },
  deferredInstallPrompt: null,
};

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(cents) {
  return moneyFormatter.format((Number(cents) || 0) / 100);
}

function today() {
  return todayValue();
}

function toInputDate(value) {
  return value || today();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getRangeDates(rangeValue) {
  const end = today();
  if (rangeValue === "all") {
    return { start: "0001-01-01", end };
  }
  const days = Number(rangeValue) || 30;
  return { start: subtractDays(end, Math.max(days - 1, 0)), end };
}

function getSummaryTotals(expenses) {
  const todayDate = today();
  const weekStart = startOfWeek(todayDate);
  const monthStart = startOfMonth(todayDate);

  return {
    today: sumSignedInRange(expenses, todayDate, todayDate),
    week: sumSignedInRange(expenses, weekStart, todayDate),
    month: sumSignedInRange(expenses, monthStart, todayDate),
  };
}

function sumSignedInRange(expenses, start, end) {
  return expenses.reduce((total, expense) => {
    if (expense.date >= start && expense.date <= end) {
      return total + Number(expense.amountCents || 0) * getSign(expense);
    }
    return total;
  }, 0);
}

function yearRange(year) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function getAvailableYears(entries) {
  const years = new Set([new Date().getFullYear()]);
  entries.forEach((entry) => {
    if (entry?.date) {
      years.add(Number(entry.date.slice(0, 4)));
    }
  });
  state.recurring.forEach((plan) => {
    if (plan?.startDate) years.add(Number(plan.startDate.slice(0, 4)));
    if (plan?.endDate) years.add(Number(plan.endDate.slice(0, 4)));
  });
  return Array.from(years)
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);
}

function filterExpenses(expenses, filters) {
  const search = filters.search.trim().toLowerCase();
  return expenses.filter((expense) => {
    const matchesSearch =
      !search ||
      expense.category.toLowerCase().includes(search) ||
      normalizeText(expense.note).toLowerCase().includes(search) ||
      formatMoney(expense.amountCents).toLowerCase().includes(search);

    const matchesCategory = filters.category === "all" || expense.category === filters.category;
    const matchesSource =
      filters.source === "all" ||
      (filters.source === "manual" && expense.sourceType !== "recurring") ||
      (filters.source === "recurring" && expense.sourceType === "recurring");
    const matchesType =
      filters.type === "all" ||
      (filters.type === "income" && expense.entryType === "income") ||
      (filters.type === "expense" && expense.entryType !== "income");

    return matchesSearch && matchesCategory && matchesSource && matchesType;
  });
}

function getSign(entry) {
  return entry.entryType === "income" ? 1 : -1;
}

function sumByType(expenses, type) {
  return expenses.reduce((total, expense) => {
    const isIncome = expense.entryType === "income";
    if ((type === "income" && isIncome) || (type === "expense" && !isIncome)) {
      return total + Number(expense.amountCents || 0);
    }
    return total;
  }, 0);
}

function buildCategoryBreakdown(expenses, type) {
  const filtered = expenses.filter((expense) =>
    type === "income" ? expense.entryType === "income" : expense.entryType !== "income"
  );
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amountCents || 0), 0);
  const categories = new Map();

  filtered.forEach((expense) => {
    categories.set(expense.category, (categories.get(expense.category) || 0) + Number(expense.amountCents || 0));
  });

  return Array.from(categories.entries())
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      percent: total > 0 ? (amountCents / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

function calculateChartData(year) {
  const range = yearRange(year);
  const combined = buildCombinedExpenses(state.expenses, state.recurring, range.start, range.end);
  const incomeTotal = sumByType(combined, "income");
  const expenseTotal = sumByType(combined, "expense");
  const balance = incomeTotal - expenseTotal;
  const transactionCount = combined.length;
  const maxTotal = Math.max(incomeTotal, expenseTotal, 1);

  return {
    combined,
    incomeTotal,
    expenseTotal,
    balance,
    transactionCount,
    maxTotal,
    breakdown:
      state.chart.tab === "income"
        ? buildCategoryBreakdown(combined, "income")
        : buildCategoryBreakdown(combined, "expense"),
  };
}

function setChartTab(tab) {
  state.chart.tab = tab;
  els.chartTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.chartTab === tab);
  });
  renderCharts();
}

function setChartYear(year) {
  state.chart.year = year;
  renderCharts();
}

function syncChartYearBounds() {
  const years = getAvailableYears(state.expenses);
  state.chart.years = years.length ? years : [new Date().getFullYear()];
  if (!state.chart.years.includes(state.chart.year)) {
    state.chart.year = state.chart.years[state.chart.years.length - 1];
  }
  els.yearPrev.disabled = state.chart.years.indexOf(state.chart.year) <= 0;
  els.yearNext.disabled = state.chart.years.indexOf(state.chart.year) >= state.chart.years.length - 1;
  els.chartYearLabel.textContent = String(state.chart.year);
}

function renderChartBreakdown(items, emptyMessage) {
  els.chartBreakdown.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    els.chartBreakdown.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "breakdown-row";

    const left = document.createElement("div");
    left.className = "breakdown-left";
    const title = document.createElement("strong");
    title.textContent = item.category;
    const meta = document.createElement("span");
    meta.textContent = `${item.percent.toFixed(1)}% · ${formatMoney(item.amountCents)}`;
    left.append(title, meta);

    const barWrap = document.createElement("div");
    barWrap.className = "breakdown-bar-track";
    const bar = document.createElement("div");
    bar.className = "breakdown-bar";
    bar.style.width = `${Math.max(item.percent, 3)}%`;
    barWrap.appendChild(bar);

    row.append(left, barWrap);
    els.chartBreakdown.appendChild(row);
  });
}

function renderCharts() {
  syncChartYearBounds();
  const data = calculateChartData(state.chart.year);

  const incomeWidth = data.maxTotal ? (data.incomeTotal / data.maxTotal) * 100 : 0;
  const expenseWidth = data.maxTotal ? (data.expenseTotal / data.maxTotal) * 100 : 0;

  els.incomeBar.style.width = `${incomeWidth}%`;
  els.expenseBar.style.width = `${expenseWidth}%`;
  els.chartIncomeTotal.textContent = formatMoney(data.incomeTotal);
  els.chartExpenseTotal.textContent = formatMoney(data.expenseTotal);
  els.chartBalanceTotal.textContent = formatMoney(data.balance);
  els.chartTransactionsCount.textContent = String(data.transactionCount);
  els.chartBalanceTotal.classList.toggle("negative", data.balance < 0);

  const emptyMessage =
    state.chart.tab === "income"
      ? "No income entries for this year."
      : state.chart.tab === "expense"
        ? "No expense entries for this year."
        : "No data for this year.";

  if (state.chart.tab === "balance") {
    renderChartBreakdown(
      [
        { category: "Income", amountCents: data.incomeTotal, percent: data.maxTotal ? (data.incomeTotal / data.maxTotal) * 100 : 0 },
        { category: "Expense", amountCents: data.expenseTotal, percent: data.maxTotal ? (data.expenseTotal / data.maxTotal) * 100 : 0 },
      ],
      emptyMessage
    );
  } else {
    renderChartBreakdown(data.breakdown, emptyMessage);
  }
}

function updateStatus(message) {
  els.syncStatus.textContent = message;
}

function createBackupPayload() {
  return {
    app: "My Wallet",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    expenses: state.expenses,
    transactions: state.expenses,
    recurring: state.recurring,
  };
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  const payload = createBackupPayload();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `my-wallet-backup-${stamp}.json`;
  downloadTextFile(filename, `${JSON.stringify(payload, null, 2)}\n`);
  updateStatus("Backup exported");
}

function importBackupClick() {
  els.importFile.value = "";
  els.importFile.click();
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const importedExpenses = Array.isArray(payload.transactions)
    ? payload.transactions
    : Array.isArray(payload.expenses)
      ? payload.expenses
      : null;
  if (!importedExpenses) return null;
  if (!Array.isArray(payload.recurring)) return null;
  const settings = payload.settings && Array.isArray(payload.settings.categories)
    ? { ...DEFAULT_SETTINGS, ...payload.settings }
    : { ...DEFAULT_SETTINGS };

  return {
    settings,
    expenses: importedExpenses,
    recurring: payload.recurring,
  };
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const backup = validateBackupPayload(parsed);

    if (!backup) {
      updateStatus("Invalid backup file");
      return;
    }

    const confirmMessage =
      "This will replace the local data on this device with the contents of the selected backup file. Continue?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    await replaceAllData(backup);
    await refreshData();
    updateStatus("Backup imported");
  } catch (error) {
    console.error(error);
    updateStatus("Import failed");
  } finally {
    els.importFile.value = "";
  }
}

function setInstallPromptAvailable(available) {
  els.installButton.classList.toggle("hidden", !available);
}

function setExpenseEditMode(expense) {
  if (!expense) {
    els.expenseForm.reset();
    els.expenseId.value = "";
    els.expenseType.value = "expense";
    els.expenseDate.value = today();
    els.expenseSubmit.textContent = "Add transaction";
    els.expenseCancel.classList.add("hidden");
    return;
  }

  els.expenseId.value = expense.id;
  els.expenseAmount.value = (Number(expense.amountCents) / 100).toFixed(2);
  els.expenseType.value = expense.entryType || "expense";
  els.expenseCategory.value = expense.category;
  els.expenseDate.value = expense.date;
  els.expenseNote.value = expense.note || "";
  els.expenseSubmit.textContent = "Update transaction";
  els.expenseCancel.classList.remove("hidden");
}

function setRecurringEditMode(plan) {
  if (!plan) {
    els.recurringForm.reset();
    els.recurringId.value = "";
    els.recurringStart.value = today();
    els.recurringActive.checked = true;
    els.recurringSubmit.textContent = "Add recurring expense";
    els.recurringCancel.classList.add("hidden");
    return;
  }

  els.recurringId.value = plan.id;
  els.recurringAmount.value = (Number(plan.amountCents) / 100).toFixed(2);
  els.recurringCategory.value = plan.category;
  els.recurringStart.value = plan.startDate;
  els.recurringFrequency.value = plan.frequency;
  els.recurringEnd.value = plan.endDate || "";
  els.recurringActive.checked = Boolean(plan.active);
  els.recurringNote.value = plan.note || "";
  els.recurringSubmit.textContent = "Update recurring expense";
  els.recurringCancel.classList.remove("hidden");
}

function buildCategorySelect(select, selectedValue) {
  const existingValue = selectedValue || select.value;
  select.innerHTML = "";

  for (const category of state.settings.categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  if (existingValue && !state.settings.categories.includes(existingValue)) {
    const option = document.createElement("option");
    option.value = existingValue;
    option.textContent = existingValue;
    select.appendChild(option);
  }

  select.value = existingValue && (state.settings.categories.includes(existingValue) || existingValue) ? existingValue : state.settings.categories[0];
}

function buildCategoryFilterSelect() {
  const current = els.filterCategory.value || "all";
  els.filterCategory.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All categories";
  els.filterCategory.appendChild(allOption);

  for (const category of state.settings.categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.filterCategory.appendChild(option);
  }

  els.filterCategory.value = state.settings.categories.includes(current) || current === "all" ? current : "all";
}

function renderSummary() {
  const totals = getSummaryTotals(state.allCombinedExpenses);
  els.todayTotal.textContent = formatMoney(totals.today);
  els.weekTotal.textContent = formatMoney(totals.week);
  els.monthTotal.textContent = formatMoney(totals.month);
  els.todayTotal.classList.toggle("negative", totals.today < 0);
  els.weekTotal.classList.toggle("negative", totals.week < 0);
  els.monthTotal.classList.toggle("negative", totals.month < 0);
}

function expenseCard(expense) {
  const card = document.createElement("article");
  card.className = "expense-card";
  card.dataset.entryType = expense.entryType || "expense";

  const top = document.createElement("div");
  top.className = "expense-top";

  const left = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "expense-title";
  title.textContent = expense.note || expense.category;
  left.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  const sourceLabel = expense.sourceType === "recurring" ? "Recurring occurrence" : "Manual entry";
  const typeLabel = expense.entryType === "income" ? "Income" : "Expense";
  meta.innerHTML = `
    <span>${expense.date}</span>
    <span>${expense.category}</span>
    <span>${typeLabel}</span>
    <span>${sourceLabel}</span>
  `;
  left.appendChild(meta);

  const amount = document.createElement("div");
  amount.className = "amount";
  amount.textContent = `${expense.entryType === "income" ? "+" : "-"}${formatMoney(expense.amountCents)}`;

  top.append(left, amount);

  const badges = document.createElement("div");
  badges.className = "badge-row";

  const sourceBadge = document.createElement("span");
  sourceBadge.className = `badge ${expense.sourceType === "recurring" ? "recurring" : "manual"}`;
  sourceBadge.textContent = expense.sourceType === "recurring" ? "Recurring" : "Manual";
  badges.appendChild(sourceBadge);

  const typeBadge = document.createElement("span");
  typeBadge.className = `badge ${expense.entryType === "income" ? "active" : "inactive"}`;
  typeBadge.textContent = expense.entryType === "income" ? "Income" : "Expense";
  badges.appendChild(typeBadge);

  if (expense.sourceType === "recurring") {
    const freqBadge = document.createElement("span");
    freqBadge.className = `badge ${expense.frequency}`;
    freqBadge.textContent = expense.frequency;
    badges.appendChild(freqBadge);
  }

  const note = document.createElement("div");
  note.className = "fine-print";
  note.textContent = expense.sourceType === "recurring"
    ? `Generated from the recurring plan for ${expense.category}.`
    : expense.note || "No note.";

  card.append(top, badges, note);

  if (expense.sourceType !== "recurring") {
    const actions = document.createElement("div");
    actions.className = "actions-row";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => setExpenseEditMode(expense));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      await deleteExpense(expense.id);
      await refreshData();
    });

    actions.append(editButton, deleteButton);
    card.append(actions);
  }

  return card;
}

function recurringCard(plan) {
  const card = document.createElement("article");
  card.className = "recurring-card";

  const top = document.createElement("div");
  top.className = "recurring-top";

  const left = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "recurring-title";
  title.textContent = plan.note || `${plan.category} recurring expense`;
  left.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.innerHTML = `
    <span>${plan.category}</span>
    <span>Starts ${plan.startDate}</span>
    <span>${plan.endDate ? `Ends ${plan.endDate}` : "No end date"}</span>
  `;
  left.appendChild(meta);

  const amount = document.createElement("div");
  amount.className = "amount";
  amount.textContent = `-${formatMoney(plan.amountCents)}`;

  top.append(left, amount);

  const badges = document.createElement("div");
  badges.className = "badge-row";
  const activeBadge = document.createElement("span");
  activeBadge.className = `badge ${plan.active ? "active" : "inactive"}`;
  activeBadge.textContent = plan.active ? "Active" : "Paused";
  badges.appendChild(activeBadge);

  const freqBadge = document.createElement("span");
  freqBadge.className = `badge ${plan.frequency}`;
  freqBadge.textContent = plan.frequency;
  badges.appendChild(freqBadge);

  const occBadge = document.createElement("span");
  occBadge.className = "badge";
  occBadge.textContent = "Virtual";
  badges.appendChild(occBadge);

  const actions = document.createElement("div");
  actions.className = "actions-row";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "secondary";
  toggleButton.textContent = plan.active ? "Pause" : "Activate";
  toggleButton.addEventListener("click", async () => {
    await saveRecurring({ ...plan, active: !plan.active });
    await refreshData();
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => setRecurringEditMode(plan));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    await deleteRecurring(plan.id);
    await refreshData();
  });

  actions.append(toggleButton, editButton, deleteButton);

  card.append(top, badges, actions);
  return card;
}

function renderCategoryEditor() {
  els.categoryList.innerHTML = "";

  state.settings.categories.forEach((category, index) => {
    const item = document.createElement("div");
    item.className = "category-item";

    const row = document.createElement("div");
    row.className = "category-row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = category;
    input.addEventListener("change", async () => {
      const next = normalizeText(input.value);
      if (!next) {
        input.value = category;
        return;
      }

      const updated = [...state.settings.categories];
      updated[index] = next;
      state.settings = { ...state.settings, categories: updated };
      await saveSettings(state.settings);
      await refreshData(false);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", async () => {
      if (state.settings.categories.length === 1) {
        return;
      }

      const updated = state.settings.categories.filter((_, currentIndex) => currentIndex !== index);
      state.settings = { ...state.settings, categories: updated };
      await saveSettings(state.settings);
      await refreshData(false);
    });

    row.append(input, deleteButton);
    item.appendChild(row);
    els.categoryList.appendChild(item);
  });

  const addItem = document.createElement("div");
  addItem.className = "category-item";
  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.placeholder = "Add a category";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add";
  addButton.addEventListener("click", async () => {
    const next = normalizeText(addInput.value);
    if (!next) return;
    if (state.settings.categories.some((category) => category.toLowerCase() === next.toLowerCase())) {
      addInput.value = "";
      return;
    }

    const updated = [...state.settings.categories, next];
    state.settings = { ...state.settings, categories: updated };
    await saveSettings(state.settings);
    addInput.value = "";
    await refreshData(false);
  });

  const row = document.createElement("div");
  row.className = "category-row";
  row.append(addInput, addButton);
  addItem.append(row);
  els.categoryList.appendChild(addItem);
}

function renderExpenseList() {
  const { start, end } = getRangeDates(state.filters.range);
  const visible = filterExpenses(
    state.allCombinedExpenses.filter((expense) => expense.date >= start && expense.date <= end),
    state.filters
  ).sort(compareExpenses);

  els.activitySubtitle.textContent =
    state.filters.range === "all"
      ? `Showing all local transactions and virtual recurring entries.`
      : `Showing entries from ${start} to ${end}.`;

  els.expenseList.innerHTML = "";
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No transactions match the current filters.";
    els.expenseList.appendChild(empty);
    return;
  }

  visible.forEach((expense) => els.expenseList.appendChild(expenseCard(expense)));
}

function renderRecurringList() {
  els.recurringList.innerHTML = "";
  if (!state.recurring.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No recurring expenses yet.";
    els.recurringList.appendChild(empty);
    return;
  }

  state.recurring.forEach((plan) => els.recurringList.appendChild(recurringCard(plan)));
}

function buildCombinedData() {
  state.allCombinedExpenses = buildCombinedExpenses(state.expenses, state.recurring, "0001-01-01", today());
}

async function persistAndRefreshExpense(expense) {
  await saveExpense(expense);
  await refreshData();
}

async function persistAndRefreshRecurring(plan) {
  await saveRecurring(plan);
  await refreshData();
}

async function refreshData(rebuild = true) {
  const [settings, expenses, recurring] = await Promise.all([
    getSettings(),
    listExpenses(),
    listRecurring(),
  ]);

  state.settings = settings || { ...DEFAULT_SETTINGS };
  state.expenses = expenses;
  state.recurring = recurring;

  if (rebuild) {
    buildCombinedData();
    renderSummary();
  }

  buildCategorySelect(els.expenseCategory, els.expenseCategory.value);
  buildCategorySelect(els.recurringCategory, els.recurringCategory.value);
  buildCategoryFilterSelect();
  renderCategoryEditor();
  renderRecurringList();
  renderExpenseList();
  renderCharts();
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const id = els.expenseId.value || makeId("expense");
  const existing = state.expenses.find((expense) => expense.id === id);
  const expense = {
    id,
    amountCents: Math.round(Number(els.expenseAmount.value) * 100),
    entryType: els.expenseType.value === "income" ? "income" : "expense",
    category: els.expenseCategory.value,
    date: els.expenseDate.value,
    note: normalizeText(els.expenseNote.value),
    sourceType: "manual",
    createdAt: existing?.createdAt,
  };

  persistAndRefreshExpense(expense)
    .then(() => setExpenseEditMode(null))
    .catch((error) => {
      console.error(error);
      updateStatus("Save failed");
    });
}

function handleRecurringSubmit(event) {
  event.preventDefault();
  const id = els.recurringId.value || makeId("recurring");
  const existing = state.recurring.find((plan) => plan.id === id);
  const recurring = {
    id,
    amountCents: Math.round(Number(els.recurringAmount.value) * 100),
    category: els.recurringCategory.value,
    startDate: els.recurringStart.value,
    frequency: els.recurringFrequency.value,
    endDate: els.recurringEnd.value || "",
    active: els.recurringActive.checked,
    note: normalizeText(els.recurringNote.value),
    createdAt: existing?.createdAt,
  };

  persistAndRefreshRecurring(recurring)
    .then(() => setRecurringEditMode(null))
    .catch((error) => {
      console.error(error);
      updateStatus("Save failed");
    });
}

function wireEvents() {
  els.expenseForm.addEventListener("submit", handleExpenseSubmit);
  els.expenseCancel.addEventListener("click", () => setExpenseEditMode(null));
  els.recurringForm.addEventListener("submit", handleRecurringSubmit);
  els.recurringCancel.addEventListener("click", () => setRecurringEditMode(null));

  els.searchInput.addEventListener("input", () => {
    state.filters.search = els.searchInput.value;
    renderExpenseList();
  });

  els.filterCategory.addEventListener("change", () => {
    state.filters.category = els.filterCategory.value;
    renderExpenseList();
  });

  els.filterType.addEventListener("change", () => {
    state.filters.type = els.filterType.value;
    renderExpenseList();
  });

  els.filterSource.addEventListener("change", () => {
    state.filters.source = els.filterSource.value;
    renderExpenseList();
  });

  els.filterRange.addEventListener("change", () => {
    state.filters.range = els.filterRange.value;
    buildCombinedData();
    renderSummary();
    renderExpenseList();
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    setInstallPromptAvailable(false);
  });

  els.exportButton.addEventListener("click", exportBackup);
  els.exportButtonBottom.addEventListener("click", exportBackup);
  els.importButton.addEventListener("click", importBackupClick);
  els.importButtonBottom.addEventListener("click", importBackupClick);
  els.importFile.addEventListener("change", handleImportFile);

  els.chartTabs.forEach((button) => {
    button.addEventListener("click", () => setChartTab(button.dataset.chartTab));
  });

  els.yearPrev.addEventListener("click", () => {
    const index = state.chart.years.indexOf(state.chart.year);
    if (index > 0) {
      setChartYear(state.chart.years[index - 1]);
    }
  });

  els.yearNext.addEventListener("click", () => {
    const index = state.chart.years.indexOf(state.chart.year);
    if (index >= 0 && index < state.chart.years.length - 1) {
      setChartYear(state.chart.years[index + 1]);
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    setInstallPromptAvailable(true);
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    setInstallPromptAvailable(false);
    updateStatus("Installed");
  });

  window.addEventListener("online", () => updateStatus("Online"));
  window.addEventListener("offline", () => updateStatus("Offline ready"));
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      updateStatus("Offline ready");
    }
  }
}

async function boot() {
  els.expenseDate.value = today();
  els.expenseType.value = "expense";
  els.recurringStart.value = today();
  state.filters.range = els.filterRange.value;
  state.filters.type = els.filterType.value;

  wireEvents();
  await initDatabase();
  buildCombinedData();
  await refreshData();
  await registerServiceWorker();
  updateStatus(navigator.onLine ? "Online" : "Offline ready");
}

boot();
