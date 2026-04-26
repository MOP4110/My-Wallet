const DB_NAME = "ledger-loop-db";
const DB_VERSION = 1;
const SETTINGS_ID = "app-settings";

const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  categories: [
    "Food",
    "Groceries",
    "Transport",
    "Home",
    "Bills",
    "Health",
    "Shopping",
    "Travel",
    "Subscriptions",
    "Other",
  ],
};

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("expenses")) {
          db.createObjectStore("expenses", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("recurring")) {
          db.createObjectStore("recurring", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
    });
  }

  return dbPromise;
}

async function withDatabase(mode, stores, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let result;

    try {
      result = callback(transaction);
    } catch (error) {
      reject(error);
      return;
    }

    Promise.resolve(result).then(
      (value) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
      },
      (error) => reject(error)
    );
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;

    try {
      result = callback(store, transaction);
    } catch (error) {
      reject(error);
      return;
    }

    Promise.resolve(result).then(
      (value) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error || new Error(`Transaction failed: ${storeName}`));
        transaction.onabort = () => reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));
      },
      (error) => reject(error)
    );
  });
}

export async function initDatabase() {
  const db = await openDatabase();
  const existing = await getSettings();
  if (!existing) {
    await saveSettings(DEFAULT_SETTINGS);
  }
  db.close?.();
  dbPromise = undefined;
  return true;
}

export async function getSettings() {
  return withStore("settings", "readonly", (store) => requestToPromise(store.get(SETTINGS_ID)));
}

export async function saveSettings(settings) {
  return withStore("settings", "readwrite", (store) =>
    requestToPromise(store.put({ ...settings, id: SETTINGS_ID }))
  );
}

export async function listExpenses() {
  const items = await withStore("expenses", "readonly", (store) => requestToPromise(store.getAll()));
  return items.sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
  });
}

export const listTransactions = listExpenses;

export async function saveExpense(expense) {
  const now = new Date().toISOString();
  const payload = {
    ...expense,
    entryType: expense.entryType === "income" ? "income" : "expense",
    amountCents: Math.round(Number(expense.amountCents) || 0),
    createdAt: expense.createdAt || now,
    updatedAt: now,
  };
  return withStore("expenses", "readwrite", (store) => requestToPromise(store.put(payload)));
}

export const saveTransaction = saveExpense;

export async function deleteExpense(id) {
  return withStore("expenses", "readwrite", (store) => requestToPromise(store.delete(id)));
}

export const deleteTransaction = deleteExpense;

export async function listRecurring() {
  const items = await withStore("recurring", "readonly", (store) => requestToPromise(store.getAll()));
  return items.sort((a, b) => {
    const activeDiff = Number(b.active) - Number(a.active);
    if (activeDiff !== 0) return activeDiff;
    return b.startDate.localeCompare(a.startDate);
  });
}

export async function saveRecurring(recurring) {
  const now = new Date().toISOString();
  const payload = {
    ...recurring,
    amountCents: Math.round(Number(recurring.amountCents) || 0),
    createdAt: recurring.createdAt || now,
    updatedAt: now,
  };
  return withStore("recurring", "readwrite", (store) => requestToPromise(store.put(payload)));
}

export async function deleteRecurring(id) {
  return withStore("recurring", "readwrite", (store) => requestToPromise(store.delete(id)));
}

export async function clearAllData() {
  return withDatabase("readwrite", ["expenses", "recurring", "settings"], (transaction) => {
    transaction.objectStore("expenses").clear();
    transaction.objectStore("recurring").clear();
    transaction.objectStore("settings").clear();
  });
}

export async function replaceAllData({ settings, expenses, recurring }) {
  const normalizedSettings = settings && Array.isArray(settings.categories)
    ? { ...DEFAULT_SETTINGS, ...settings, id: SETTINGS_ID }
    : { ...DEFAULT_SETTINGS };
  const normalizedExpenses = Array.isArray(expenses) ? expenses : [];
  const normalizedRecurring = Array.isArray(recurring) ? recurring : [];

  return withDatabase("readwrite", ["expenses", "recurring", "settings"], (transaction) => {
    const expenseStore = transaction.objectStore("expenses");
    const recurringStore = transaction.objectStore("recurring");
    const settingsStore = transaction.objectStore("settings");

    expenseStore.clear();
    recurringStore.clear();
    settingsStore.clear();

    settingsStore.put(normalizedSettings);
    normalizedExpenses.forEach((expense) => {
      if (expense && expense.id) {
        expenseStore.put({
          ...expense,
          entryType: expense.entryType === "income" ? "income" : "expense",
        });
      }
    });
    normalizedRecurring.forEach((plan) => {
      if (plan && plan.id) {
        recurringStore.put(plan);
      }
    });
  });
}

export { DEFAULT_SETTINGS };
