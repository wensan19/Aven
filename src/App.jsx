import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { CategoryComparisonChart, FinanceChart, StockLineChart } from "./components/Charts";
import { EmptyState } from "./components/ui/EmptyState";
import { Modal } from "./components/ui/Modal";
import {
  addActivity,
  createStarterCategories,
  deleteBudget,
  deleteCategory,
  deleteTransaction,
  followUser,
  getFeed,
  getSocialCounts,
  listFinanceData,
  listSummaryData,
  listUsers,
  saveBudget,
  saveCategory,
  saveProfile,
  saveTransaction,
  unfollowUser,
  uploadPublicFile,
} from "./services/dataService";
import { addStock, fetchStockHistory, fetchStockQuote, removeStock, searchStocks } from "./services/stockService";
import { byType, FINANCE_TYPES, groupByCategory, money, monthKey, monthStart, normalizeFinanceType, pct } from "./utils/format";

const MONEY_SOURCES = {
  allowance: "Allowance",
  bank_account: "Bank Account",
  banking: "Banking",
  stocks: "Stocks / Investments",
  cash: "Cash",
  other: "Other",
};

const SOURCE_CATEGORY_SLOTS = [
  { key: "stocks", categoryType: "stocks", title: "Stocks", description: "Track stock or investment money and decide whether it counts as allowance.", createName: "Stocks", createLabel: "Create Stocks category" },
  { key: "banking", categoryType: "banking", title: "Banking / Bank Account", description: "Track bank, checking, or debit account money separately or as allowance.", createName: "", createLabel: "Add Bank", sourceCreate: "banking" },
];
const STANDARD_CATEGORY_TYPES = ["allowance", "income", "spending", "savings"];

const blankEntry = { type: "spending", title: "", amount: "", category_id: "", note: "", image_url: "", source_type: "allowance", counts_as_allowance: false, source_amount: "", allowance_amount: "", date: new Date().toISOString().slice(0, 10) };
const blankCategory = { type: "spending", name: "", icon_url: "" };
const blankFinanceUpdate = { type: "spending", title: "", amount: "", target_amount: "", category_id: "", note: "", image_url: "", source_type: "allowance", counts_as_allowance: false, source_amount: "", allowance_amount: "", date: new Date().toISOString().slice(0, 10) };

function InnerApp() {
  const auth = useAuth();
  const [active, setActive] = useState("dashboard");
  const [data, setData] = useState({ categories: [], transactions: [], budgets: [], stocks: [] });
  const [month, setMonth] = useState(monthKey());
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  async function refresh() {
    if (!auth.user) return;
    setLoading(true);
    setError("");
    try {
      const next = await listFinanceData(auth.user.id, monthStart(month));
      if (!next.categories.length) {
        await createStarterCategories(auth.user.id);
        next.categories = (await listFinanceData(auth.user.id, monthStart(month))).categories;
      }
      setData(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [auth.user?.id, month]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMonth(monthKey());
    }, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (auth.loading) return <div className="splash">Loading Aven...</div>;
  if (!auth.user) return <AuthPage configured={auth.configured} connection={auth.connection} authError={auth.error} />;

  const openModal = (type, item = null) => {
    setError("");
    setFeedback("");
    setModal({ type, item });
  };
  const closeModal = () => setModal(null);
  const props = {
    data,
    setData,
    refresh,
    month,
    setMonth,
    user: auth.user,
    profile: auth.profile,
    setProfile: auth.setProfile,
    setModal: openModal,
    setError,
    setFeedback,
    setImagePreview,
  };

  return (
    <Layout active={active} setActive={setActive}>
      {error && <div className="alert">{error}</div>}
      {feedback && <div className="success">{feedback}</div>}
      {loading && <div className="loading-strip">Syncing with Supabase...</div>}
      {active === "dashboard" && <Dashboard {...props} />}
      {active === "transactions" && <Transactions {...props} />}
      {active === "categories" && <Categories {...props} />}
      {active === "targets" && <Targets {...props} />}
      {active === "analytics" && <Analytics {...props} />}
      {active === "summaries" && <Summaries {...props} />}
      {active === "stocks" && <Stocks {...props} />}
      {active === "profile" && <Profile {...props} />}
      {active === "discover" && <Discover {...props} />}
      {active === "feed" && <Feed {...props} />}
      {modal?.type === "finance" && <FinanceUpdateModal {...props} item={modal.item} onClose={closeModal} />}
      {modal?.type === "stockEntry" && <SourceEntryModal {...props} item={modal.item} kind="stocks" onClose={closeModal} />}
      {modal?.type === "bankEntry" && <SourceEntryModal {...props} item={modal.item} kind="banking" onClose={closeModal} />}
      {modal?.type === "transaction" && <TransactionModal {...props} item={modal.item} onClose={closeModal} />}
      {modal?.type === "category" && <CategoryModal {...props} item={modal.item} onClose={closeModal} />}
      {imagePreview && <ImageLightbox image={imagePreview} onClose={() => setImagePreview(null)} />}
    </Layout>
  );
}

function Dashboard({ data, setModal, setImagePreview }) {
  const totals = useTotals(data.transactions);
  const spendingTarget = data.budgets.find((budget) => budget.type === "spending" && !budget.category_id);
  const targetPct = pct(totals.spending, spendingTarget?.target_amount);
  const balance = totals.allowance + totals.income - totals.spending - totals.savings;
  const summaryCards = [
    dashboardSummaryItem("Allowance", "allowance", totals.allowance, data.budgets),
    dashboardSummaryItem("Earned", "income", totals.income, data.budgets),
    dashboardSummaryItem("Spent", "spending", totals.spending, data.budgets),
    dashboardSummaryItem("Saved", "savings", totals.savings, data.budgets),
    { label: "Balance", value: balance },
    { label: "Targets", value: data.budgets.length, plain: true },
  ];

  return (
    <>
      <section className="hero-grid">
        <article className="balance-panel">
          <div>
            <p className="eyebrow">Remaining Balance</p>
            <h2>{money(balance)}</h2>
            <p className="muted">Allowance, earned money, spending, and savings stay private by default.</p>
          </div>
          <div className="progress-ring">
            <span>{targetPct}%</span>
            <small>spent</small>
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">Budget Pace</p>
          <h2>{targetPct >= 100 ? "Over target" : targetPct >= 80 ? "Close to limit" : "On track"}</h2>
          <p className="muted">{spendingTarget ? `${money(Math.max(spendingTarget.target_amount - totals.spending, 0))} left this month.` : "Add a monthly target to begin."}</p>
          <Progress value={targetPct} />
          <button className="primary-action full" type="button" onClick={() => setModal("finance")}>
            <Plus size={16} /> Add Transaction
          </button>
        </article>
      </section>
      <section className="summary-grid">
        {summaryCards.map((card) => (
          <article className="summary-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.plain ? card.value : money(card.value)}</strong>
            {card.type && (
              <div className="summary-progress">
                <p className="muted">{card.target ? `${money(card.value)} / ${money(card.target)}` : "No target set yet"}</p>
                <Progress value={card.target ? card.progress : 0} />
                <p className={card.exceeded ? "danger-text" : "muted"}>
                  {card.target ? (card.exceeded ? `${money(card.value - card.target)} over target` : `${money(card.remaining)} remaining`) : "Add a target from Log Amount"}
                </p>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="section-grid">
        <article className="panel">
          <h2>Recent entries</h2>
          <TransactionList entries={data.transactions.slice(0, 5)} categories={data.categories} onImageOpen={setImagePreview} />
        </article>
        <article className="panel">
          <h2>Insights</h2>
          <InsightList data={data} totals={totals} />
        </article>
      </section>
    </>
  );
}

function Transactions({ data, refresh, setModal, setError, setFeedback, setImagePreview }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const entries = [...data.transactions]
    .filter((entry) => `${entry.note} ${entry.categories?.name || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === "highest" ? b.amount - a.amount : sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));

  async function remove(id) {
    try {
      await deleteTransaction(id);
      await refresh();
      setFeedback("Transaction deleted.");
    } catch (err) {
      console.error("Delete transaction failed:", err);
      setError(err.message);
    }
  }

  return (
    <Page title="Every dollar, neatly placed" eyebrow="Transactions" action={<button className="primary-action" onClick={() => setModal("finance")}>Manage Money</button>}>
      <section className="filter-panel">
        <label>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes or category" />
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
          </select>
        </label>
      </section>
      <TransactionList entries={entries} categories={data.categories} onEdit={(entry) => setModal("transaction", entry)} onDelete={remove} onImageOpen={setImagePreview} />
    </Page>
  );
}

function Categories({ data, refresh, setModal, setError, setFeedback, setImagePreview }) {
  useEffect(() => {
    console.debug("Categories image preview setter:", typeof setImagePreview === "function" ? "available" : "missing");
  }, [setImagePreview]);

  function openImagePreview(image) {
    console.debug("Categories open image preview:", {
      hasSetter: typeof setImagePreview === "function",
      hasImage: Boolean(image?.url || image),
    });
    if (typeof setImagePreview === "function") {
      setImagePreview(image);
      return;
    }
    console.warn("Image preview is unavailable because setImagePreview was not provided.");
  }

  async function remove(id) {
    try {
      await deleteCategory(id);
      await refresh();
      setFeedback("Category deleted.");
    } catch (err) {
      console.error("Delete category failed:", err);
      setError(err.message);
    }
  }

  async function removeLog(id) {
    try {
      await deleteTransaction(id);
      await refresh();
      setFeedback("Log entry deleted.");
    } catch (err) {
      console.error("Delete log failed:", err);
      setError(err.message);
    }
  }

  return (
    <Page title="Customize your money groups" eyebrow="Categories" action={<button className="primary-action" onClick={() => setModal("category")}>Add Category</button>}>
      <p className="muted page-note">Categories are labels and icons. Amounts are saved as transactions and can be assigned to any category you create.</p>
      <div className="category-sections">
        <SourceAccountsSection data={data} setModal={setModal} onDeleteCategory={remove} onDeleteLog={removeLog} onImageOpen={openImagePreview} />
        {STANDARD_CATEGORY_TYPES.map((type) => {
          const categories = data.categories.filter((category) => normalizeFinanceType(category.type) === type && !isSourceCategory(category));
          return (
            <section className="panel" key={type}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{financeDisplayLabel(type)}</p>
                  <h2>{financeDisplayLabel(type)} Categories</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setModal("category", { type })}>Add {financeDisplayLabel(type)}</button>
              </div>
              <div className="card-list">
                {categories.length ? categories.map((category) => (
                  <article className="list-card" key={category.id}>
                    <div className="category-card-main">
                      <Avatar url={category.icon_url} label={category.name} />
                      <div className="category-card-copy">
                        <p className="item-title">{category.name}</p>
                        <p className="muted">{financeDisplayLabel(category.type)} category</p>
                        {isSourceCategory(category) && <p className="source-line">Add amounts as allowance or keep them separate as {MONEY_SOURCES[sourceTypeForCategory(category)].toLowerCase()}.</p>}
                        <CategoryProgress category={category} data={data} />
                      </div>
                    </div>
                    <div className="category-card-actions">
                      <button className="tiny-button" type="button" onClick={() => setModal("finance", financeItemForCategory(category))}>{isSourceCategory(category) ? "Add Amount" : "Log Amount"}</button>
                      <button className="tiny-button" type="button" onClick={() => setModal("category", category)}>Edit</button>
                      <button className="tiny-button" type="button" onClick={() => remove(category.id)}><Trash2 size={14} /> Delete</button>
                    </div>
                    <CategoryLogAccordion category={category} data={data} onEdit={(entry) => setModal("transaction", entry)} onDelete={removeLog} onImageOpen={openImagePreview} />
                  </article>
                )) : (
                  <EmptyState title={`No ${financeDisplayLabel(type).toLowerCase()} categories yet`}>Create a custom category like food, gifts, freelance, travel, or subscriptions.</EmptyState>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </Page>
  );
}

function SourceAccountsSection({ data, setModal, onDeleteCategory, onDeleteLog, onImageOpen }) {
  return (
    <section className="panel source-accounts-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Source Accounts</p>
          <h2>Stocks & Banking</h2>
        </div>
      </div>
      <p className="muted page-note">These cards stay visible so stock and bank account amounts are easy to add, review, and keep separate from allowance when needed.</p>
      <div className="card-list">
        {SOURCE_CATEGORY_SLOTS.map((slot) => {
          const matches = data.categories.filter((category) => sourceTypeForCategory(category) === slot.key);
          if (!matches.length) {
            return (
              <article className="soft-card source-empty-card" key={slot.key}>
                <div>
                  <p className="item-title">{slot.title}</p>
                  <p className="muted">{slot.description}</p>
                </div>
                <button className="primary-action" type="button" onClick={() => setModal("category", { type: slot.categoryType, name: slot.createName, sourceCreate: slot.sourceCreate })}>
                  {slot.createLabel}
                </button>
              </article>
            );
          }
          return matches.map((category) => (
            <SourceCategoryCard
              key={category.id}
              category={category}
              data={data}
              setModal={setModal}
              onDeleteCategory={onDeleteCategory}
              onDeleteLog={onDeleteLog}
              onImageOpen={onImageOpen}
            />
          ));
        })}
      </div>
    </section>
  );
}

function SourceCategoryCard({ category, data, setModal, onDeleteCategory, onDeleteLog, onImageOpen }) {
  const sourceType = sourceTypeForCategory(category);
  const isStocks = sourceType === "stocks";
  const sourceLabel = isStocks ? "Stocks source card" : "Banking source card";
  const actionLabel = isStocks ? "Add Stocks" : "Add Bank";
  return (
    <article className="list-card source-account-card">
      <div className="category-card-main">
        <Avatar url={category.icon_url} label={category.name} />
        <div className="category-card-copy">
          <p className="eyebrow">{sourceLabel}</p>
          <p className="item-title">{category.name}</p>
          <p className="source-line">Add amounts as allowance or keep them separate as {MONEY_SOURCES[sourceTypeForCategory(category)].toLowerCase()}.</p>
          <CategoryProgress category={category} data={data} />
        </div>
      </div>
      <div className="source-primary-action">
        <button className="primary-action" type="button" onClick={() => setModal(isStocks ? "stockEntry" : "category", isStocks ? financeItemForCategory(category) : { type: "banking", name: "", sourceCreate: "banking" })}>{actionLabel}</button>
      </div>
      <div className="category-card-actions source-secondary-actions">
        <button className="tiny-button" type="button" onClick={() => setModal("finance", financeItemForCategory(category))}>Log Amount</button>
        <button className="tiny-button" type="button" onClick={() => setModal("category", category)}>Edit</button>
        <button className="tiny-button" type="button" onClick={() => onDeleteCategory(category.id)}><Trash2 size={14} /> Delete</button>
      </div>
      <CategoryLogAccordion category={category} data={data} onEdit={(entry) => setModal("transaction", entry)} onDelete={onDeleteLog} onImageOpen={onImageOpen} />
    </article>
  );
}

function Targets({ data, refresh, setModal, setError, setFeedback }) {
  async function remove(id) {
    try {
      await deleteBudget(id);
      await refresh();
      setFeedback("Budget target deleted.");
    } catch (err) {
      console.error("Delete budget failed:", err);
      setError(err.message);
    }
  }
  return (
    <Page title="Budget targets at a glance" eyebrow="Targets" action={<button className="primary-action" onClick={() => setModal("finance")}>Manage Money</button>}>
      <section className="target-grid">
        {data.budgets.length ? (
          data.budgets.map((budget) => {
            const used = budget.category_id
              ? data.transactions.filter((entry) => entry.category_id === budget.category_id).reduce((sum, entry) => sum + Number(entry.amount), 0)
              : byType(data.transactions, budget.type);
            const progress = pct(used, budget.target_amount);
            return (
              <article className="target-card" key={budget.id}>
                <p className="item-title">{budget.name || FINANCE_TYPES[budget.type]}</p>
                <strong>{money(used)} / {money(budget.target_amount)}</strong>
                <Progress value={progress} />
                <p className={progress >= 100 && budget.type === "spending" ? "danger-text" : "muted"}>{progress}% complete</p>
                <button className="tiny-button" onClick={() => setModal("finance", { type: budget.type, category_id: budget.category_id || "" })}>Manage Money</button>
                <button className="tiny-button" onClick={() => remove(budget.id)}>Delete</button>
              </article>
            );
          })
        ) : (
          <EmptyState title="No targets yet">Add monthly spending, income, or savings targets.</EmptyState>
        )}
      </section>
    </Page>
  );
}

function Analytics({ data }) {
  const [mode, setMode] = useState("spending");
  const [type, setType] = useState("pie");
  const chartData = mode === "compare"
    ? [
        { name: "Earned", value: byType(data.transactions, "allowance") + byType(data.transactions, "income") },
        { name: "Spent", value: byType(data.transactions, "spending") },
        { name: "Saved", value: byType(data.transactions, "savings") },
      ].filter((item) => item.value > 0)
    : groupByCategory(data.transactions, data.categories, mode);
  return (
    <Page title="See where money is moving" eyebrow="Analytics">
      <section className="filter-panel">
        <label>
          Data
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="spending">Spending breakdown</option>
            <option value="income">Income breakdown</option>
            <option value="savings">Savings breakdown</option>
            <option value="compare">Earned vs spent</option>
          </select>
        </label>
        <label>
          Chart
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="pie">Pie chart</option>
            <option value="bar">Bar chart</option>
          </select>
        </label>
      </section>
      <FinanceChart data={chartData} type={type} />
    </Page>
  );
}

function Summaries({ user }) {
  const [mode, setMode] = useState("monthly");
  const [summaryData, setSummaryData] = useState({ transactions: [], budgets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSummaryKey, setSelectedSummaryKey] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    listSummaryData(user.id)
      .then((next) => {
        if (active) setSummaryData(next);
      })
      .catch((err) => {
        console.error("Load summaries failed:", err);
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const summaries = useMemo(() => buildSummaries(summaryData.transactions, summaryData.budgets, mode), [summaryData.transactions, summaryData.budgets, mode]);
  const selectedSummary = summaries.find((summary) => summary.key === selectedSummaryKey) || summaries[0];
  const trendComparison = useMemo(
    () => buildCategoryComparison(summaryData.transactions, mode, selectedSummary),
    [summaryData.transactions, mode, selectedSummary],
  );

  useEffect(() => {
    if (!summaries.length) {
      setSelectedSummaryKey("");
      return;
    }
    if (!summaries.some((summary) => summary.key === selectedSummaryKey)) {
      setSelectedSummaryKey(summaries[0].key);
    }
  }, [mode, selectedSummaryKey, summaries]);

  return (
    <Page title="Review saved history" eyebrow="Summaries">
      <section className="filter-panel">
        <label>
          Period
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="weekly">Weekly summaries</option>
            <option value="monthly">Monthly summaries</option>
            <option value="yearly">Yearly summaries</option>
          </select>
        </label>
      </section>
      {loading && <div className="loading-strip">Loading history...</div>}
      {error && <div className="alert">{error}</div>}
      <section className="section-grid">
        <article className="panel">
          <h2>{summaryModeLabel(mode)}</h2>
          <div className="summary-history-list">
            {summaries.length ? summaries.map((summary) => <SummaryCard key={summary.key} summary={summary} />) : <EmptyState title="No summaries yet">Add dated transactions and Aven will build weekly, monthly, and yearly history automatically.</EmptyState>}
          </div>
        </article>
        <article className="panel">
          <div className="section-heading">
            <div>
              <h2>Trend</h2>
              <p className="muted">Category comparison for {trendComparison.currentLabel || "this period"} vs {trendComparison.previousLabel || "the previous period"}.</p>
            </div>
            {summaries.length > 0 && (
              <label className="compact-select">
                Compare
                <select value={selectedSummary?.key || ""} onChange={(event) => setSelectedSummaryKey(event.target.value)}>
                  {summaries.map((summary) => (
                    <option key={summary.key} value={summary.key}>{summary.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <CategoryComparisonChart data={trendComparison.data} currentLabel={trendComparison.currentLabel} previousLabel={trendComparison.previousLabel} />
        </article>
      </section>
    </Page>
  );
}

function SummaryCard({ summary }) {
  const target = summary.targetAmount;
  const progress = pct(summary.totals.spending, target);
  const exceeded = target > 0 && summary.totals.spending > target;

  return (
    <article className="summary-history-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{summary.periodType}</p>
          <h3>{summary.label}</h3>
        </div>
        <span className={summary.balance >= 0 ? "gain-text" : "danger-text"}>{money(summary.balance)}</span>
      </div>
      <div className="summary-mini-grid">
        <span>Allowance <strong>{money(summary.totals.allowance)}</strong></span>
        <span>Earned <strong>{money(summary.totals.income)}</strong></span>
        <span>Spent <strong>{money(summary.totals.spending)}</strong></span>
        <span>Saved <strong>{money(summary.totals.savings)}</strong></span>
      </div>
      <div className="summary-progress">
        <p className="muted">{target ? `Spent ${money(summary.totals.spending)} / ${money(target)}` : "No spending target saved for this period"}</p>
        <Progress value={target ? progress : 0} />
        <p className={exceeded ? "danger-text" : "muted"}>{target ? (exceeded ? `${money(summary.totals.spending - target)} over target` : `${money(Math.max(target - summary.totals.spending, 0))} remaining`) : "Targets stay attached to their original month."}</p>
      </div>
    </article>
  );
}

function Stocks({ data, user, refresh }) {
  const [symbol, setSymbol] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [selected, setSelected] = useState("");
  const [range, setRange] = useState("1m");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadQuotes() {
    setError("");
    setQuoteLoading(true);
    const loaded = {};
    const results = await Promise.allSettled(data.stocks.map((row) => fetchStockQuote(row.symbol)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") loaded[data.stocks[index].symbol] = result.value;
    });
    const failed = results.find((result) => result.status === "rejected");
    if (failed) setError(failed.reason?.message || "Some stock quotes could not be loaded.");
    setQuotes(loaded);
    setQuoteLoading(false);
  }

  async function runSearch(event) {
    event.preventDefault();
    const query = symbol.trim();
    if (!query) return;
    setError("");
    setSearchLoading(true);
    try {
      const results = await searchStocks(query);
      setSearchResults(results);
      if (!results.length) setError("No matching stocks found. Try a company name or ticker symbol.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    loadQuotes();
    if (!selected && data.stocks[0]) setSelected(data.stocks[0].symbol);
    if (selected && !data.stocks.some((row) => row.symbol === selected)) setSelected(data.stocks[0]?.symbol || "");
  }, [data.stocks.map((row) => row.symbol).join(",")]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    setChartLoading(true);
    setError("");
    fetchStockHistory(selected, range)
      .then((result) => setHistory(result.points || []))
      .catch((err) => {
        setHistory([]);
        setError(err.message);
      })
      .finally(() => setChartLoading(false));
  }, [selected, range]);

  async function add(symbolToAdd = symbol) {
    const normalized = String(symbolToAdd || "").trim().toUpperCase();
    if (!normalized) return;
    setError("");
    setSaving(true);
    try {
      await addStock(user.id, normalized);
      setSymbol("");
      setSearchResults([]);
      setSelected(normalized);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(symbolToRemove) {
    setError("");
    setSaving(true);
    try {
      await removeStock(user.id, symbolToRemove);
      if (selected === symbolToRemove) setSelected("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Your watchlist, softly organized" eyebrow="Stocks" action={<button className="ghost-button" onClick={loadQuotes}>Refresh</button>}>
      <form className="stock-search-form" onSubmit={runSearch}>
        <label>
          Search Stock
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Apple, AAPL, Microsoft..." required />
        </label>
        <button className="primary-action" disabled={searchLoading || saving}>{searchLoading ? "Searching..." : "Search"}</button>
      </form>
      {searchResults.length > 0 && (
        <div className="stock-search-results">
          {searchResults.map((result) => (
            <article className="stock-result" key={`${result.symbol}-${result.exchange}`}>
              <div>
                <p className="item-title">{result.symbol}</p>
                <p className="muted">{result.name || "Unknown company"}{result.exchange ? ` - ${result.exchange}` : ""}</p>
              </div>
              <button className="tiny-button" type="button" disabled={saving} onClick={() => add(result.symbol)}>Add to Watchlist</button>
            </article>
          ))}
        </div>
      )}
      {error && <div className="alert">{error}</div>}
      {quoteLoading && <div className="loading-strip">Loading latest stock quotes...</div>}
      <section className="stock-layout">
        <div className="card-list">
          {data.stocks.length ? data.stocks.map((row) => <StockCard key={row.id} quote={quotes[row.symbol]} symbol={row.symbol} active={selected === row.symbol} onSelect={setSelected} onRemove={remove} loading={quoteLoading && !quotes[row.symbol]} />) : <EmptyState title="No stocks saved">Search a company or ticker to start your watchlist.</EmptyState>}
        </div>
        <article className="panel">
          <div className="section-heading">
            <h2>{selected || "Select a stock"}</h2>
            <div className="range-pills">{["1d", "1w", "1m", "6m", "1y"].map((item) => <button key={item} className={`range-pill ${range === item ? "active" : ""}`} onClick={() => setRange(item)}>{item.toUpperCase()}</button>)}</div>
          </div>
          {chartLoading ? <div className="loading-strip">Loading chart...</div> : <StockLineChart points={history} />}
        </article>
      </section>
    </Page>
  );
}

function Profile({ user, profile, setProfile }) {
  const [form, setForm] = useState(profile || {});
  const [file, setFile] = useState(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  useEffect(() => {
    setForm(profile || {});
    if (user) getSocialCounts(user.id).then(setCounts).catch(() => {});
  }, [profile?.id]);

  async function submit(event) {
    event.preventDefault();
    const avatar_url = file ? await uploadPublicFile("avatars", user.id, file) : form.avatar_url;
    const saved = await saveProfile({ ...form, id: user.id, email: user.email || "", avatar_url });
    setProfile(saved);
    await addActivity({ user_id: user.id, type: "profile_updated", title: "Updated their profile", body: "Fresh profile details are live.", is_public: saved.is_public });
  }

  return (
    <Page title="Your profile" eyebrow="Profile">
      <section className="profile-grid">
        <article className="panel profile-card">
          <Avatar url={form.avatar_url} label={form.display_name} large />
          <h2>{form.display_name}</h2>
          <p className="muted">@{form.username}</p>
          <p>{form.bio}</p>
          <div className="summary-grid compact">
            <div><strong>{counts.followers}</strong><span>Followers</span></div>
            <div><strong>{counts.following}</strong><span>Following</span></div>
          </div>
        </article>
        <form className="panel form-grid" onSubmit={submit}>
          <label>Username<input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>Display name<input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="wide">Bio<textarea value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
          <label>Profile photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} /></label>
          <label className="check-row"><input type="checkbox" checked={Boolean(form.is_public)} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} /> Public profile</label>
          <label className="check-row"><input type="checkbox" checked={Boolean(form.share_finance_summary)} onChange={(e) => setForm({ ...form, share_finance_summary: e.target.checked })} /> Share monthly summaries</label>
          <button className="primary-action wide">Save Profile</button>
        </form>
      </section>
    </Page>
  );
}

function Discover({ user }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [following, setFollowing] = useState(new Set());
  useEffect(() => { listUsers(search).then((rows) => setUsers(rows.filter((row) => row.id !== user.id))).catch(() => {}); }, [search]);
  async function toggle(targetId) {
    if (following.has(targetId)) {
      await unfollowUser(user.id, targetId);
      setFollowing(new Set([...following].filter((id) => id !== targetId)));
    } else {
      await followUser(user.id, targetId);
      setFollowing(new Set([...following, targetId]));
    }
  }
  return (
    <Page title="Find public Aven profiles" eyebrow="Discover">
      <label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username or display name" /></label>
      <div className="card-list">{users.map((person) => <article className="list-card" key={person.id}><Avatar url={person.avatar_url} label={person.display_name} /><div><p className="item-title">{person.display_name}</p><p className="muted">@{person.username} - {person.bio}</p></div><button className="primary-action" onClick={() => toggle(person.id)}>{following.has(person.id) ? "Unfollow" : "Follow"}</button></article>)}</div>
    </Page>
  );
}

function Feed({ user }) {
  const [items, setItems] = useState([]);
  useEffect(() => { getFeed(user.id).then(setItems).catch(() => {}); }, [user.id]);
  return (
    <Page title="Privacy-safe updates" eyebrow="Following Feed">
      <div className="card-list">
        {items.length ? items.map((item) => <article className="list-card" key={item.id}><Avatar url={item.profiles?.avatar_url} label={item.profiles?.display_name} /><div><p className="item-title">{item.profiles?.display_name || "Aven friend"} {item.title.toLowerCase()}</p><p className="muted">{item.body}</p></div></article>) : <EmptyState title="No feed yet">Follow public profiles to see summary-based activity.</EmptyState>}
      </div>
    </Page>
  );
}

function transactionFormFromItem(item) {
  if (!item) return blankEntry;
  return {
    id: item.id,
    type: normalizeFinanceType(item.type),
    title: item.title || "",
    amount: item.amount === null || item.amount === undefined ? "" : String(item.amount),
    category_id: item.category_id || "",
    note: item.note || "",
    image_url: item.image_url || "",
    source_type: item.source_type || "allowance",
    counts_as_allowance: Boolean(item.counts_as_allowance),
    source_amount: item.source_amount === null || item.source_amount === undefined ? "" : String(item.source_amount),
    allowance_amount: item.allowance_amount === null || item.allowance_amount === undefined ? "" : String(item.allowance_amount),
    date: item.date || new Date().toISOString().slice(0, 10),
  };
}

function categoryFormFromItem(item) {
  if (!item) return blankCategory;
  return {
    id: item.id,
    type: normalizeFinanceType(item.type),
    name: item.name || "",
    icon_url: item.icon_url || "",
    sourceCreate: item.sourceCreate || "",
  };
}

function financeUpdateFormFromItem(item, budgets) {
  const type = normalizeFinanceType(item?.type);
  const categoryId = item?.category_id || "";
  const budget = budgets.find((row) => row.type === type && (row.category_id || "") === categoryId);
  return {
    ...blankFinanceUpdate,
    type,
    category_id: categoryId,
    title: item?.title || "",
    image_url: item?.image_url || "",
    source_type: item?.source_type || "allowance",
    counts_as_allowance: Boolean(item?.counts_as_allowance),
    source_amount: item?.source_amount === null || item?.source_amount === undefined ? "" : String(item?.source_amount || ""),
    allowance_amount: item?.allowance_amount === null || item?.allowance_amount === undefined ? "" : String(item?.allowance_amount || ""),
    target_amount: budget?.target_amount === null || budget?.target_amount === undefined ? "" : String(budget?.target_amount || ""),
  };
}

function financeItemForCategory(category) {
  const sourceType = sourceTypeForCategory(category);
  const normalizedType = normalizeFinanceType(category.type);
  const type = sourceType === "stocks" ? "stocks" : sourceType === "bank_account" ? "banking" : normalizedType;
  return {
    type,
    category_id: category.id,
    source_type: sourceType,
    counts_as_allowance: sourceType === "allowance",
  };
}

function sourceTypeForFinanceType(type) {
  const normalizedType = normalizeFinanceType(type);
  if (normalizedType === "stocks") return "stocks";
  if (normalizedType === "banking") return "banking";
  return "allowance";
}

function isSourceCategory(category) {
  return ["bank_account", "banking", "stocks"].includes(sourceTypeForCategory(category));
}

function sourceTypeForCategory(category) {
  const type = normalizeFinanceType(category?.type);
  if (type === "stocks") return "stocks";
  if (type === "banking") return "banking";
  const name = normalizeCategoryName(category?.name);
  if (["stock", "stocks", "investment", "investments", "investing"].some((term) => name.includes(term))) return "stocks";
  if (["bank", "banking", "bankaccount", "checking", "debit"].some((term) => name.includes(term))) return "banking";
  return "allowance";
}

function normalizeCategoryName(value = "") {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formWithCategorySource(categories, form, categoryId) {
  const category = categories.find((row) => sameCategoryId(row.id, categoryId));
  if (!category) return { ...form, category_id: categoryId };
  const sourceType = sourceTypeForCategory(category);
  if (!sourceCanStaySeparate(sourceType)) return { ...form, category_id: categoryId };
  return {
    ...form,
    category_id: categoryId,
    source_type: sourceType,
    counts_as_allowance: false,
    source_amount: "",
    allowance_amount: "",
  };
}

function formWithTypeSource(form, type) {
  const sourceType = sourceTypeForFinanceType(type);
  if (!sourceCanStaySeparate(sourceType)) return { ...form, type, category_id: "" };
  return {
    ...form,
    type,
    category_id: "",
    source_type: sourceType,
    counts_as_allowance: false,
    source_amount: "",
    allowance_amount: "",
  };
}

function fallbackLogTitle(form, category) {
  const providedTitle = String(form.title || "").trim();
  if (providedTitle) return providedTitle;
  return `${category?.name || financeDisplayLabel(form.type)} entry`;
}

function sourcePayloadForForm(form, category) {
  const inferredSource = sourceCanStaySeparate(form.source_type) ? form.source_type : sourceTypeForCategory(category);
  const sourceType = sourceCanStaySeparate(inferredSource) ? inferredSource : form.source_type || "allowance";
  const countsAsAllowance = sourceCanStaySeparate(sourceType) ? Boolean(form.counts_as_allowance) : false;
  const totalAmount = parseAmount(form.amount, "Total amount");
  const allowanceAmount = countsAsAllowance ? allowancePortionAmount(form, totalAmount) : null;
  return {
    source_type: sourceType,
    counts_as_allowance: countsAsAllowance,
    source_amount: sourceCanStaySeparate(sourceType) ? totalAmount : null,
    allowance_amount: allowanceAmount,
  };
}

function allowancePortionAmount(form, totalAmount) {
  const rawValue = String(form.allowance_amount ?? "").trim();
  const allowanceAmount = rawValue === "" ? 0 : parseAmount(rawValue, "Allowance portion");
  if (allowanceAmount > totalAmount) throw new Error("Allowance portion cannot be more than the total amount.");
  return allowanceAmount;
}

function sourceEntryConfig(kind) {
  if (kind === "stocks") {
    return {
      type: "stocks",
      sourceType: "stocks",
      label: "Stocks",
      modalTitle: "Add Stocks",
      eyebrow: "Investment Entry",
      help: "Add a stock or investment entry. Keep it separate as investment money or count it toward allowance.",
      titlePlaceholder: "Apple shares, index fund deposit...",
      amountLabel: "Investment Amount",
      notePlaceholder: "Ticker, shares, reason for purchase, or investment notes...",
      submitLabel: "Save Stock Entry",
    };
  }
  return {
    type: "banking",
    sourceType: "banking",
    label: "Banking",
    modalTitle: "Add Bank",
    eyebrow: "Banking Entry",
    help: "Add a bank account entry. Keep it separate as bank money or count it toward allowance.",
    titlePlaceholder: "Checking deposit, debit account balance...",
    amountLabel: "Bank Amount",
    notePlaceholder: "Transfer notes, account details, or anything useful...",
    submitLabel: "Save Bank Entry",
  };
}

async function saveStockEntry(args) {
  return saveDedicatedSourceEntry({
    ...args,
    config: {
      ...args.config,
      type: "stocks",
      sourceType: "stocks",
      amountLabel: "Investment Amount",
    },
  });
}

async function saveBankEntry(args) {
  return saveDedicatedSourceEntry({
    ...args,
    config: {
      ...args.config,
      type: "banking",
      sourceType: "banking",
      amountLabel: "Bank Amount",
    },
  });
}

async function saveDedicatedSourceEntry({ config, form, category, file, removeImage, user, data, month }) {
  const amount = parseAmount(form.amount, config.amountLabel);
  const hasTarget = String(form.target_amount).trim() !== "";
  const image_url = file ? await uploadPublicFile("transaction-images", user.id, file) : removeImage ? "" : form.image_url || "";
  const sourcePayload = sourcePayloadForForm({ ...form, source_type: config.sourceType }, category);
  await saveTransaction({
    user_id: user.id,
    type: config.type,
    category_id: category.id,
    title: fallbackLogTitle(form, category),
    image_url,
    ...sourcePayload,
    amount,
    note: form.note || "",
    date: form.date,
  });
  if (hasTarget) {
    const existingBudget = findBudgetForScope(data.budgets, config.type, category.id);
    await saveBudget({
      id: existingBudget?.id,
      user_id: user.id,
      type: config.type,
      category_id: category.id,
      name: `${category.name} Target`,
      target_amount: parseAmount(form.target_amount, "Target amount"),
      month: monthStart(month),
      is_public_goal: false,
    });
  }
}

function parseAmount(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a valid number that is 0 or higher.`);
  }
  return amount;
}

function optionalSourceAmount(form) {
  if (!sourceCanStaySeparate(form.source_type) || form.counts_as_allowance) return null;
  if (String(form.source_amount).trim() === "") return parseAmount(form.amount, "Source amount");
  return parseAmount(form.source_amount, "Source amount");
}

function sourceCanStaySeparate(sourceType) {
  return ["bank_account", "banking", "stocks"].includes(sourceType);
}

function allowanceAmountValue(entry) {
  if (entry.allowance_amount !== null && entry.allowance_amount !== undefined && entry.allowance_amount !== "") {
    return Number(entry.allowance_amount || 0);
  }
  return entry.counts_as_allowance ? sourceAmountValue(entry) : 0;
}

function findCategoryForTransaction(categories, type, categoryId) {
  if (categoryId) return categories.find((category) => sameCategoryId(category.id, categoryId));
  const normalizedType = normalizeFinanceType(type);
  return categories.find((category) => normalizeFinanceType(category.type) === normalizedType);
}

function sameCategoryId(left, right) {
  return String(left || "") === String(right || "");
}

function scopeCurrentAmount(transactions, type, categoryId = "") {
  return transactions
    .filter((entry) => normalizeFinanceType(entry.type) === normalizeFinanceType(type) && (!categoryId || sameCategoryId(entry.category_id, categoryId)))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function categoryLogEntries(transactions, category) {
  return transactions.filter((entry) => normalizeFinanceType(entry.type) === normalizeFinanceType(category.type) && sameCategoryId(entry.category_id, category.id));
}

function sourceAmountValue(entry) {
  if (entry.source_amount !== null && entry.source_amount !== undefined && entry.source_amount !== "") {
    return Number(entry.source_amount || 0);
  }
  return Number(entry.amount || 0);
}

function categoryVisibleAmount(logs, category) {
  if (!isSourceCategory(category)) return logs.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return logs.reduce((sum, entry) => sum + sourceAmountValue(entry), 0);
}

function sourceCategoryBreakdown(logs, category) {
  if (!isSourceCategory(category)) return null;
  return logs.reduce(
    (totals, entry) => {
      const value = sourceAmountValue(entry);
      if (entry.counts_as_allowance || entry.source_type === "allowance") {
        const allowanceValue = allowanceAmountValue(entry);
        totals.allowance += allowanceValue;
        totals.separate += Math.max(value - allowanceValue, 0);
      } else {
        totals.separate += value;
      }
      return totals;
    },
    { allowance: 0, separate: 0 },
  );
}

function findBudgetForScope(budgets, type, categoryId = "") {
  return budgets.find((row) => normalizeFinanceType(row.type) === normalizeFinanceType(type) && sameCategoryId(row.category_id, categoryId));
}

function FinanceUpdateModal({ data, user, refresh, onClose, item, month, setError, setFeedback }) {
  const [form, setForm] = useState(() => financeUpdateFormFromItem(item, data.budgets));
  const [file, setFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [localError, setLocalError] = useState("");
  const editedOriginalAmount = item?.id ? Number(item.amount || 0) : 0;

  useEffect(() => {
    const budget = findBudgetForScope(data.budgets, form.type, form.category_id);
    setForm((current) => ({
      ...current,
      target_amount: budget?.target_amount === null || budget?.target_amount === undefined ? "" : String(budget?.target_amount || ""),
    }));
  }, [form.type, form.category_id, data.budgets]);

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      const hasAmount = String(form.amount).trim() !== "";
      const hasTarget = String(form.target_amount).trim() !== "";
      if (!hasAmount && !hasTarget) throw new Error("Enter a current amount, a target amount, or both.");

      if (hasAmount) {
        const category = findCategoryForTransaction(data.categories, form.type, form.category_id);
        if (!category) throw new Error("Aven could not find the internal category for this finance type. Refresh and try again.");
        const image_url = file ? await uploadPublicFile("transaction-images", user.id, file) : removeImage ? "" : form.image_url || "";
        const sourcePayload = sourcePayloadForForm(form, category);
        await saveTransaction({
          user_id: user.id,
          type: form.type,
          category_id: category.id,
          title: fallbackLogTitle(form, category),
          image_url,
          ...sourcePayload,
          amount: parseAmount(form.amount, "Current amount"),
          note: form.note || "",
          date: form.date,
        });
      }

      if (hasTarget) {
        const existingBudget = findBudgetForScope(data.budgets, form.type, form.category_id);
        const selectedCategory = data.categories.find((category) => category.id === form.category_id);
        await saveBudget({
          id: existingBudget?.id,
          user_id: user.id,
          type: form.type,
          category_id: form.category_id || null,
          name: selectedCategory ? `${selectedCategory.name} Target` : `${financeDisplayLabel(form.type)} Target`,
          target_amount: parseAmount(form.target_amount, "Target amount"),
          month: monthStart(month),
          is_public_goal: false,
        });
      }

      await refresh();
      setFeedback("Finance update saved.");
      onClose();
    } catch (err) {
      console.error("Manage money save failed:", err);
      setLocalError(err.message);
      setError(err.message);
    }
  }

  const existingTotal = scopeCurrentAmount(data.transactions, form.type, form.category_id);
  const typedAmount = String(form.amount).trim() === "" ? 0 : Number(form.amount);
  const previewAmount = Number.isFinite(typedAmount) ? typedAmount : 0;
  const adjustedExistingTotal = Math.max(existingTotal - editedOriginalAmount, 0);
  const projectedTotal = adjustedExistingTotal + previewAmount;
  const previewTarget = String(form.target_amount).trim() ? Number(form.target_amount) : 0;
  const previewProgress = pct(projectedTotal, previewTarget);
  const remaining = Math.max(previewTarget - projectedTotal, 0);
  const exceeded = previewTarget > 0 && projectedTotal > previewTarget;

  return (
    <Modal title="Manage Money" eyebrow="Finance Update" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        {localError && <div className="alert wide">{localError}</div>}
        <label>
          Log Name
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="McDonald's lunch, allowance from parents..." />
        </label>
        <label>
          Finance Type
          <TypeSelect value={form.type} onChange={(type) => setForm(formWithTypeSource(form, type))} />
        </label>
        <label>
          Current Amount
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100.00" />
        </label>
        <label>
          Target Amount
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="300.00" />
        </label>
        <label>
          Category
          <select value={form.category_id} onChange={(e) => setForm(formWithCategorySource(data.categories, form, e.target.value))}>
            <option value="">Default {financeDisplayLabel(form.type)} category</option>
            {data.categories.filter((category) => normalizeFinanceType(category.type) === normalizeFinanceType(form.type)).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <SourceFields form={form} setForm={setForm} />
        <div className="progress-summary wide">
          <div className="section-heading">
            <div>
              <p className="item-title">{financeDisplayLabel(form.type)} progress</p>
              <p className="muted">{previewTarget ? `${money(projectedTotal)} / ${money(previewTarget)}` : "No target set yet"}</p>
            </div>
            <span className="progress-pill">{previewTarget ? `${previewProgress}%` : "0%"}</span>
          </div>
          <Progress value={previewTarget ? previewProgress : 0} />
          <p className={exceeded ? "danger-text" : "muted"}>{previewTarget ? (exceeded ? `${money(projectedTotal - previewTarget)} over target` : `${money(remaining)} remaining`) : "Enter a target amount to see progress."}</p>
          <p className="muted">Already logged this month: {money(existingTotal)}</p>
          <p className="muted">New entry amount: {money(previewAmount)}</p>
          <p className="muted">Projected after save: {money(projectedTotal)}</p>
        </div>
        <label>
          Date
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="wide">
          Optional Note
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Allowance, paycheck, lunch, savings transfer..." />
        </label>
        <label className="wide">
          Optional Image
          <input type="file" accept="image/*" onChange={(e) => { setFile(e.target.files?.[0] || null); setRemoveImage(false); }} />
        </label>
        {(file || (form.image_url && !removeImage)) && (
          <div className="image-preview wide">
            <img src={file ? URL.createObjectURL(file) : form.image_url} alt="" />
            <button className="tiny-button" type="button" onClick={() => { setFile(null); setRemoveImage(true); }}>Remove Image</button>
          </div>
        )}
        <p className="muted wide">Current amount is saved as a transaction. Target amount updates this month's target for the selected category or type.</p>
        <button className="primary-action wide">Save Finance Update</button>
      </form>
    </Modal>
  );
}

function SourceEntryModal({ data, user, refresh, onClose, item, kind, month, setError, setFeedback }) {
  const config = sourceEntryConfig(kind);
  const [form, setForm] = useState(() => ({
    ...blankEntry,
    type: config.type,
    category_id: item?.category_id || "",
    source_type: config.sourceType,
    counts_as_allowance: false,
    target_amount: "",
    date: new Date().toISOString().slice(0, 10),
  }));
  const [file, setFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [localError, setLocalError] = useState("");
  const sourceLabel = MONEY_SOURCES[config.sourceType] || config.label;
  const categories = data.categories.filter((category) => normalizeFinanceType(category.type) === config.type || sourceTypeForCategory(category) === config.sourceType);

  useEffect(() => {
    const budget = findBudgetForScope(data.budgets, config.type, form.category_id);
    setForm((current) => ({
      ...current,
      target_amount: budget?.target_amount === null || budget?.target_amount === undefined ? "" : String(budget?.target_amount || ""),
    }));
  }, [config.type, form.category_id, data.budgets]);

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      const category = data.categories.find((row) => sameCategoryId(row.id, form.category_id));
      if (!category) throw new Error(`Choose a ${config.label.toLowerCase()} category before saving.`);
      if (config.type === "banking") {
        await saveBankEntry({ config, form, category, file, removeImage, user, data, month });
      } else {
        await saveStockEntry({ config, form, category, file, removeImage, user, data, month });
      }
      await refresh();
      setFeedback(`${config.label} entry saved.`);
      onClose();
    } catch (err) {
      console.error(`${config.label} entry save failed:`, err);
      setLocalError(err.message);
      setError(err.message);
    }
  }

  const existingTotal = scopeCurrentAmount(data.transactions, config.type, form.category_id);
  const previewAmount = String(form.amount).trim() === "" ? 0 : Number(form.amount);
  const projectedTotal = existingTotal + (Number.isFinite(previewAmount) ? previewAmount : 0);
  const previewTarget = String(form.target_amount).trim() ? Number(form.target_amount) : 0;
  const previewProgress = pct(projectedTotal, previewTarget);
  const exceeded = previewTarget > 0 && projectedTotal > previewTarget;

  return (
    <Modal title={config.modalTitle} eyebrow={config.eyebrow} onClose={onClose}>
      <form className="form-grid single simple-modal-form" onSubmit={submit}>
        {localError && <div className="alert wide">{localError}</div>}
        <p className="muted wide">{config.help}</p>
        <label>
          Log Name
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={config.titlePlaceholder} />
        </label>
        <label>
          {config.amountLabel}
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="100.00" required />
        </label>
        <label>
          Category
          <select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value, source_type: config.sourceType })} required>
            <option value="">Choose {config.label.toLowerCase()} category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          Target Amount
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.target_amount} onChange={(event) => setForm({ ...form, target_amount: event.target.value })} placeholder="300.00" />
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </label>
        <SourceTreatmentToggle form={form} setForm={setForm} sourceLabel={sourceLabel} />
        {form.counts_as_allowance && (
          <label>
            Amount to Count as Allowance
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.allowance_amount} onChange={(event) => setForm({ ...form, allowance_amount: event.target.value })} placeholder="0.00" />
          </label>
        )}
        <div className="progress-summary wide">
          <div className="section-heading">
            <div>
              <p className="item-title">{config.label} progress</p>
              <p className="muted">{previewTarget ? `${money(projectedTotal)} / ${money(previewTarget)}` : "No target set yet"}</p>
            </div>
            <span className="progress-pill">{previewTarget ? `${previewProgress}%` : "0%"}</span>
          </div>
          <Progress value={previewTarget ? previewProgress : 0} />
          <p className={exceeded ? "danger-text" : "muted"}>{previewTarget ? (exceeded ? `${money(projectedTotal - previewTarget)} over target` : `${money(Math.max(previewTarget - projectedTotal, 0))} remaining`) : "Enter a target amount to see progress."}</p>
        </div>
        <label className="wide">
          Optional Note
          <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={config.notePlaceholder} />
        </label>
        <label className="wide">
          Optional Image
          <input type="file" accept="image/*" onChange={(event) => { setFile(event.target.files?.[0] || null); setRemoveImage(false); }} />
        </label>
        {(file || (form.image_url && !removeImage)) && (
          <div className="image-preview wide">
            <img src={file ? URL.createObjectURL(file) : form.image_url} alt="" />
            <button className="tiny-button" type="button" onClick={() => { setFile(null); setRemoveImage(true); }}>Remove Image</button>
          </div>
        )}
        <button className="primary-action wide">{config.submitLabel}</button>
      </form>
    </Modal>
  );
}

function TransactionModal({ data, user, refresh, onClose, item, setError, setFeedback }) {
  const [form, setForm] = useState(() => transactionFormFromItem(item));
  const [file, setFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [localError, setLocalError] = useState("");
  const isEditing = Boolean(item?.id);
  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      const amount = parseAmount(form.amount, "Transaction amount");
      if (!form.category_id) throw new Error("Choose a category before saving the transaction.");
      const category = data.categories.find((row) => sameCategoryId(row.id, form.category_id));
      if (!category) throw new Error("Choose a valid category before saving the transaction.");
      const image_url = file ? await uploadPublicFile("transaction-images", user.id, file) : removeImage ? "" : form.image_url || "";
      const sourcePayload = sourcePayloadForForm(form, category);
      await saveTransaction({
        id: form.id,
        user_id: user.id,
        type: form.type,
        category_id: form.category_id,
        title: fallbackLogTitle(form, category),
        image_url,
        ...sourcePayload,
        amount,
        note: form.note || "",
        date: form.date,
      });
      await refresh();
      setFeedback(isEditing ? "Transaction amount updated." : "Transaction saved.");
      onClose();
    } catch (err) {
      console.error("Save transaction failed:", err);
      setLocalError(err.message);
      setError(err.message);
    }
  }
  return <Modal title={isEditing ? "Edit Log Entry" : "Manage Money"} eyebrow="Money Entry" onClose={onClose}><form className="form-grid" onSubmit={submit}>{localError && <div className="alert wide">{localError}</div>}<FinanceFields form={form} setForm={setForm} categories={data.categories} /><label className="wide">Optional Image<input type="file" accept="image/*" onChange={(e) => { setFile(e.target.files?.[0] || null); setRemoveImage(false); }} /></label>{(file || (form.image_url && !removeImage)) && <div className="image-preview wide"><img src={file ? URL.createObjectURL(file) : form.image_url} alt="" /><button className="tiny-button" type="button" onClick={() => { setFile(null); setRemoveImage(true); }}>Remove Image</button></div>}<button className="primary-action wide">{isEditing ? "Update Log Entry" : "Save Transaction Amount"}</button></form></Modal>;
}

function CategoryModal({ user, refresh, onClose, item, setError, setFeedback }) {
  const [form, setForm] = useState(() => categoryFormFromItem(item));
  const [file, setFile] = useState(null);
  const [localError, setLocalError] = useState("");
  const isEditing = Boolean(item?.id);
  const isBankCreate = !isEditing && form.sourceCreate === "banking";
  const modalTitle = isBankCreate ? "Add Bank" : isEditing ? "Edit Category" : "Add Category";
  const modalEyebrow = isBankCreate ? "Banking Source" : "Category";
  const nameLabel = isBankCreate ? "Bank Name / Account Name" : "Category Name";
  const namePlaceholder = isBankCreate ? "DBS, OCBC, UOB, YouTrip, Trust..." : "Food, shopping, freelance, travel...";
  const helperText = isBankCreate
    ? "Create a bank source first. Use Log Amount on the bank card when you want to add money entries."
    : "Categories organize transactions. Money amounts are entered from Manage Money or Log Amount.";
  const submitLabel = isBankCreate ? "Create Bank" : isEditing ? "Update Category" : "Create Category";

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      if (!form.name.trim()) throw new Error("Category name is required.");
      const icon_url = file ? await uploadPublicFile("category-icons", user.id, file) : form.icon_url || "";
      await saveCategory({
        id: form.id,
        user_id: user.id,
        type: form.type,
        name: form.name.trim(),
        icon_url,
      });
      await refresh();
      setFeedback(isEditing ? "Category updated." : isBankCreate ? "Bank source created." : "Category created.");
      onClose();
    } catch (err) {
      console.error("Save category failed:", err);
      setLocalError(err.message);
      setError(err.message);
    }
  }

  return (
    <Modal title={modalTitle} eyebrow={modalEyebrow} onClose={onClose}>
      <form className="form-grid single simple-modal-form" onSubmit={submit}>
        {localError && <div className="alert wide">{localError}</div>}
        <label>
          {nameLabel}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={namePlaceholder} required />
        </label>
        <label>
          Finance Type
          {isBankCreate ? (
            <select value="banking" disabled>
              <option value="banking">Banking</option>
            </select>
          ) : (
            <TypeSelect value={form.type} onChange={(type) => setForm({ ...form, type })} />
          )}
        </label>
        <label className="wide">
          {isBankCreate ? "Optional Icon" : "Category Icon"}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} />
        </label>
        {form.icon_url && <p className="muted wide">Current icon will stay unless you upload a replacement.</p>}
        <p className="muted wide">{helperText}</p>
        <button className="primary-action wide">{submitLabel}</button>
      </form>
    </Modal>
  );
}

function FinanceFields({ form, setForm, categories }) {
  return (
    <>
      <label>Log Name<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="McDonald's lunch, Grab ride, cafe shift..." /></label>
      <label>Transaction Amount<input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100.00" required /></label>
      <label>Type<TypeSelect value={form.type} onChange={(type) => setForm(formWithTypeSource(form, type))} /></label>
      <label>Category<select value={form.category_id} onChange={(e) => setForm(formWithCategorySource(categories, form, e.target.value))} required><option value="">Choose category</option>{categories.filter((c) => normalizeFinanceType(c.type) === normalizeFinanceType(form.type)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <SourceFields form={form} setForm={setForm} />
      <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
      <label className="wide">Private note<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Notes stay private by default." /></label>
    </>
  );
}

function TypeSelect({ value, onChange }) {
  return <select value={normalizeFinanceType(value)} onChange={(e) => onChange(e.target.value)}>{Object.keys(FINANCE_TYPES).map((key) => <option key={key} value={key}>{financeDisplayLabel(key)}</option>)}</select>;
}

function SourceFields({ form, setForm }) {
  const sourceNeedsChoice = sourceCanStaySeparate(form.source_type);
  const sourceLabel = MONEY_SOURCES[form.source_type] || "Source";
  return (
    <>
      <label>
        Money Source
        <select value={form.source_type} onChange={(event) => setForm({ ...form, source_type: event.target.value, counts_as_allowance: false, source_amount: "" })}>
          {Object.entries(MONEY_SOURCES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {sourceNeedsChoice && (
        <>
          <SourceTreatmentToggle form={form} setForm={setForm} sourceLabel={sourceLabel} />
          {form.counts_as_allowance && (
            <label>
              Amount to Count as Allowance
              <input type="number" min="0" step="0.01" inputMode="decimal" value={form.allowance_amount} onChange={(event) => setForm({ ...form, allowance_amount: event.target.value })} placeholder="0.00" />
            </label>
          )}
          {!form.counts_as_allowance && (
            <label>
              {sourceLabel} Amount
              <input type="number" min="0" step="0.01" inputMode="decimal" value={form.source_amount} onChange={(event) => setForm({ ...form, source_amount: event.target.value })} placeholder={form.amount || "100.00"} />
            </label>
          )}
        </>
      )}
    </>
  );
}

function SourceTreatmentToggle({ form, setForm, sourceLabel }) {
  return (
    <div className="wide source-choice">
      <p className="muted">How should this {sourceLabel.toLowerCase()} amount be treated?</p>
      <div className="segmented-toggle" role="radiogroup" aria-label="Money treatment">
        <button
          className={`allowance-option ${form.counts_as_allowance ? "active" : ""}`}
          type="button"
          aria-pressed={Boolean(form.counts_as_allowance)}
          onClick={() => setForm({ ...form, counts_as_allowance: true, source_amount: "", allowance_amount: form.allowance_amount || "" })}
        >
          Count as Allowance
        </button>
        <button
          className={`separate-option ${!form.counts_as_allowance ? "active" : ""}`}
          type="button"
          aria-pressed={!form.counts_as_allowance}
          onClick={() => setForm({ ...form, counts_as_allowance: false, allowance_amount: "" })}
        >
          Keep Separate
        </button>
      </div>
      <p className="toggle-status">Selected: {form.counts_as_allowance ? "Count as Allowance" : "Keep Separate"}</p>
    </div>
  );
}

function Page({ eyebrow, title, action, children }) {
  return <section><div className="section-heading page-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>{children}</section>;
}

function summaryModeLabel(mode) {
  return {
    weekly: "Weekly history",
    monthly: "Monthly history",
    yearly: "Yearly history",
  }[mode];
}

function buildSummaries(transactions, budgets, mode) {
  const grouped = new Map();
  transactions.forEach((entry) => {
    const meta = periodMeta(entry.date, mode);
    if (!grouped.has(meta.key)) {
      grouped.set(meta.key, {
        ...meta,
        periodType: mode.replace("ly", ""),
        totals: { allowance: 0, income: 0, spending: 0, savings: 0, stocks: 0, banking: 0 },
        balance: 0,
        targetAmount: 0,
      });
    }
    const summary = grouped.get(meta.key);
    meta.monthKeys.forEach((key) => {
      if (!summary.monthKeys.includes(key)) summary.monthKeys.push(key);
    });
    const entryType = normalizeFinanceType(entry.type);
    summary.totals[entryType] = Number(summary.totals[entryType] || 0) + Number(entry.amount || 0);
  });

  return Array.from(grouped.values())
    .map((summary) => {
      summary.balance = summary.totals.allowance + summary.totals.income - summary.totals.spending - summary.totals.savings;
      summary.targetAmount = targetForSummary(budgets, summary, mode);
      return summary;
    })
    .sort((a, b) => b.sortValue.localeCompare(a.sortValue));
}

function buildCategoryComparison(transactions, mode, currentSummary) {
  if (!currentSummary) {
    return { data: [], currentLabel: "", previousLabel: "" };
  }

  const previousKey = previousPeriodKey(currentSummary.key, mode);
  const currentTotals = categoryTotalsForPeriod(transactions, mode, currentSummary.key);
  const previousTotals = categoryTotalsForPeriod(transactions, mode, previousKey);
  const categoryKeys = new Set([...currentTotals.keys(), ...previousTotals.keys()]);

  return {
    currentLabel: currentSummary.label,
    previousLabel: labelForPeriodKey(previousKey, mode),
    data: Array.from(categoryKeys)
      .map((key) => {
        const current = currentTotals.get(key);
        const previous = previousTotals.get(key);
        return {
          name: current?.name || previous?.name || "Uncategorized",
          type: current?.type || previous?.type || "spending",
          current: current?.amount || 0,
          previous: previous?.amount || 0,
        };
      })
      .sort((a, b) => (b.current + b.previous) - (a.current + a.previous)),
  };
}

function categoryTotalsForPeriod(transactions, mode, periodKey) {
  const totals = new Map();
  if (!periodKey) return totals;
  transactions.forEach((entry) => {
    if (periodMeta(entry.date, mode).key !== periodKey) return;
    const categoryName = entry.categories?.name || financeDisplayLabel(entry.type) || "Uncategorized";
    const entryType = normalizeFinanceType(entry.type);
    const key = `${entryType}:${categoryName}`;
    const current = totals.get(key) || { name: categoryName, type: entryType, amount: 0 };
    totals.set(key, { ...current, amount: current.amount + Number(entry.amount || 0) });
  });
  return totals;
}

function previousPeriodKey(key, mode) {
  if (!key) return "";
  if (mode === "yearly") return String(Number(key) - 1);
  if (mode === "weekly") {
    const match = key.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return "";
    const monday = isoWeekStart(Number(match[1]), Number(match[2]));
    monday.setUTCDate(monday.getUTCDate() - 7);
    const { year, week } = isoWeek(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  const [year, month] = key.split("-").map(Number);
  const previousMonth = new Date(year, month - 2, 1);
  return monthKey(previousMonth);
}

function labelForPeriodKey(key, mode) {
  if (!key) return "Previous period";
  if (mode === "yearly") return key;
  if (mode === "weekly") {
    const [, year, week] = key.match(/^(\d{4})-W(\d{2})$/) || [];
    return year ? `Week ${Number(week)}, ${year}` : "Previous week";
  }
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function targetForSummary(budgets, summary, mode) {
  if (mode === "monthly") {
    return Number(budgets.find((budget) => budget.type === "spending" && !budget.category_id && budget.month?.slice(0, 7) === summary.key)?.target_amount || 0);
  }
  if (mode === "yearly") {
    return budgets
      .filter((budget) => budget.type === "spending" && !budget.category_id && budget.month?.slice(0, 4) === summary.key)
      .reduce((sum, budget) => sum + Number(budget.target_amount || 0), 0);
  }
  const weekMonths = new Set(summary.monthKeys);
  return budgets
    .filter((budget) => budget.type === "spending" && !budget.category_id && weekMonths.has(budget.month?.slice(0, 7)))
    .reduce((sum, budget) => sum + Number(budget.target_amount || 0), 0);
}

function periodMeta(dateValue, mode) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (mode === "weekly") {
    const { year, week } = isoWeek(date);
    return {
      key: `${year}-W${String(week).padStart(2, "0")}`,
      sortValue: `${year}-W${String(week).padStart(2, "0")}`,
      label: `Week ${week}, ${year}`,
      shortLabel: `W${week}`,
      monthKeys: [monthKey(date)],
    };
  }
  if (mode === "yearly") {
    const year = String(date.getFullYear());
    return { key: year, sortValue: year, label: year, shortLabel: year, monthKeys: [] };
  }
  const key = monthKey(date);
  return {
    key,
    sortValue: key,
    label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    shortLabel: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    monthKeys: [key],
  };
}

function isoWeek(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { year: utcDate.getUTCFullYear(), week };
}

function isoWeekStart(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  if (day <= 4) {
    simple.setUTCDate(simple.getUTCDate() - day + 1);
  } else {
    simple.setUTCDate(simple.getUTCDate() + 8 - day);
  }
  return simple;
}

function dashboardSummaryItem(label, type, value, budgets) {
  const target = Number(findBudgetForScope(budgets, type)?.target_amount || 0);
  const progress = pct(value, target);
  const exceeded = target > 0 && value > target;
  return {
    label,
    type,
    value,
    target,
    progress,
    exceeded,
    remaining: Math.max(target - value, 0),
  };
}

function CategoryProgress({ category, data }) {
  const logs = categoryLogEntries(data.transactions, category);
  const current = categoryVisibleAmount(logs, category);
  const sourceBreakdown = sourceCategoryBreakdown(logs, category);
  const budget = findBudgetForScope(data.budgets, category.type, category.id);
  const target = Number(budget?.target_amount || 0);
  const progress = pct(current, target);
  const exceeded = target > 0 && current > target;

  return (
    <div className={`category-progress ${sourceBreakdown ? "source-category-progress" : ""}`}>
      <div className="section-heading">
        {sourceBreakdown ? (
          <div>
            <p className="source-total-label">{category.name} total</p>
            <strong className="source-total-amount">{money(current)}</strong>
          </div>
        ) : (
          <span className="muted">{target ? `${money(current)} / ${money(target)}` : `${money(current)} logged`}</span>
        )}
        <span className="progress-pill">{target ? `${progress}%` : "No target"}</span>
      </div>
      {sourceBreakdown && (
        <div className="source-total-row">
          <span><small>Counted as allowance</small><strong>{money(sourceBreakdown.allowance)}</strong></span>
          <span><small>Kept separate</small><strong>{money(sourceBreakdown.separate)}</strong></span>
        </div>
      )}
      <Progress value={target ? progress : 0} />
      <p className={exceeded ? "danger-text" : "muted"}>{target ? (exceeded ? `${money(current - target)} over target` : `${money(Math.max(target - current, 0))} remaining`) : "No target set yet"}</p>
    </div>
  );
}

function CategoryLogAccordion({ category, data, onEdit, onDelete, onImageOpen }) {
  const logs = categoryLogEntries(data.transactions, category);
  useEffect(() => {
    console.debug("CategoryLogAccordion image opener:", {
      category: category.name,
      available: typeof onImageOpen === "function",
    });
  }, [category.name, onImageOpen]);

  function openLogImage(image) {
    console.debug("CategoryLogAccordion open image:", {
      category: category.name,
      available: typeof onImageOpen === "function",
    });
    if (typeof onImageOpen === "function") onImageOpen(image);
  }

  return (
    <details className="log-accordion">
      <summary><span><ChevronDown size={17} /> {logs.length ? `View logs (${logs.length})` : "Show logs"}</span></summary>
      <div className="log-list">
        {logs.length ? logs.map((entry) => (
          <article className="log-entry" key={entry.id}>
            <LogThumb entry={entry} onOpen={openLogImage} />
            <div>
              <p className="item-title">{entry.title || entry.categories?.name || financeDisplayLabel(entry.type)}</p>
              <p className="muted">{entry.note || "No description"}</p>
              <p className="muted">{entry.date}</p>
              <p className="source-line">{sourceDescription(entry)}</p>
            </div>
            <strong className={["spending", "savings"].includes(normalizeFinanceType(entry.type)) ? "danger-text" : "gain-text"}>{["spending", "savings"].includes(normalizeFinanceType(entry.type)) ? "-" : "+"}{money(entry.amount)}</strong>
            <div className="log-actions">
              <button className="tiny-button" type="button" onClick={() => onEdit(entry)}>Edit</button>
              <button className="tiny-button" type="button" onClick={() => onDelete(entry.id)}>Delete</button>
            </div>
          </article>
        )) : (
          <p className="muted">Use Log Amount to add the first entry for this category.</p>
        )}
      </div>
    </details>
  );
}

function LogThumb({ entry, onOpen }) {
  if (entry.image_url) return <button className="log-thumb-button" type="button" onClick={() => onOpen?.({ url: entry.image_url, title: entry.title || "Log image" })}><img className="log-thumb" src={entry.image_url} alt="" /></button>;
  return <div className="log-thumb placeholder">{(entry.title || entry.categories?.name || "A").slice(0, 1).toUpperCase()}</div>;
}

function ImageLightbox({ image, onClose }) {
  const imageUrl = typeof image === "string" ? image : image?.url;
  const imageTitle = typeof image === "string" ? "Image preview" : image?.title || "Image preview";
  if (!imageUrl) return null;

  return (
    <div className="lightbox-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="lightbox-card" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <p className="item-title">{imageTitle}</p>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close image preview">x</button>
        </div>
        <img src={imageUrl} alt="" />
      </section>
    </div>
  );
}

function sourceDescription(entry) {
  const source = MONEY_SOURCES[entry.source_type] || "Allowance";
  if (sourceCanStaySeparate(entry.source_type)) {
    if (entry.counts_as_allowance) {
      const allowanceValue = allowanceAmountValue(entry);
      const separateValue = Math.max(sourceAmountValue(entry) - allowanceValue, 0);
      return `${source} - ${money(allowanceValue)} allowance, ${money(separateValue)} kept separate`;
    }
    return `${source} - kept separate${entry.source_amount ? ` ${money(entry.source_amount)}` : ""}`;
  }
  return `Source: ${source}`;
}

function financeDisplayLabel(type) {
  const normalizedType = normalizeFinanceType(type);
  return {
    allowance: "Allowance",
    income: "Earned",
    spending: "Spent",
    savings: "Saved",
    stocks: "Stocks",
    banking: "Banking",
  }[normalizedType] || FINANCE_TYPES[normalizedType];
}

function TransactionList({ entries, onEdit, onDelete, onImageOpen }) {
  if (!entries.length) return <EmptyState title="No entries yet">Add allowance, income, spending, or savings.</EmptyState>;
  return <div className="card-list">{entries.map((entry) => <article className="list-card" key={entry.id}><LogThumb entry={entry} onOpen={onImageOpen} /><div><p className="item-title">{entry.title || entry.categories?.name || financeDisplayLabel(entry.type)}</p><p className="muted">{entry.categories?.name || financeDisplayLabel(entry.type)} - {entry.date} - {entry.note || "No note"}</p><p className="source-line">{sourceDescription(entry)}</p></div><strong className={["spending", "savings"].includes(normalizeFinanceType(entry.type)) ? "danger-text" : "gain-text"}>{["spending", "savings"].includes(normalizeFinanceType(entry.type)) ? "-" : "+"}{money(entry.amount)}</strong>{onEdit && <button className="tiny-button" onClick={() => onEdit(entry)}>Edit</button>}{onDelete && <button className="tiny-button" onClick={() => onDelete(entry.id)}>Delete</button>}</article>)}</div>;
}

function InsightList({ data, totals }) {
  const biggest = groupByCategory(data.transactions, data.categories, "spending").sort((a, b) => b.value - a.value)[0];
  return <div className="card-list"><article className="soft-card"><p className="item-title">Biggest spending</p><p className="muted">{biggest ? `${biggest.name} at ${money(biggest.value)}` : "No spending yet."}</p></article><article className="soft-card"><p className="item-title">Savings progress</p><p className="muted">{money(totals.savings)} saved this month.</p></article></div>;
}

function StockCard({ symbol, quote, active, onSelect, onRemove, loading }) {
  const change = Number(quote?.percentChange || 0);
  return (
    <article className={`stock-card ${active ? "active" : ""}`} onClick={() => onSelect(symbol)}>
      <div className="stock-card-top">
        <div>
          <p className="stock-symbol">{symbol}</p>
          <p className="stock-name">{quote?.name || (loading ? "Loading quote..." : "Quote unavailable")}</p>
        </div>
        <span className={change < 0 ? "stock-change loss" : "stock-change"}>{quote ? `${change.toFixed(2)}%` : "--"}</span>
      </div>
      <strong>{quote ? money(quote.currentPrice, quote.currency) : loading ? "Loading" : "No quote"}</strong>
      {quote && (
        <>
          <div className="stock-stat-grid">
            <StockStat label="Today High" value={money(quote.dailyHigh, quote.currency)} />
            <StockStat label="Today Low" value={money(quote.dailyLow, quote.currency)} />
            <StockStat label="52W High" value={money(quote.fiftyTwoWeekHigh, quote.currency)} />
            <StockStat label="52W Low" value={money(quote.fiftyTwoWeekLow, quote.currency)} />
          </div>
          {quote.fiftyTwoWeekPosition !== null && quote.fiftyTwoWeekPosition !== undefined && (
            <div className="stock-range">
              <div className="section-heading">
                <span className="muted">52-week position</span>
                <span className="progress-pill">{quote.fiftyTwoWeekPosition}%</span>
              </div>
              <Progress value={quote.fiftyTwoWeekPosition} />
            </div>
          )}
          <p className="muted">Updated {quote.lastUpdated || "recently"}</p>
        </>
      )}
      <button className="tiny-button" onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}>Remove</button>
    </article>
  );
}

function StockStat({ label, value }) {
  return <div className="stock-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Avatar({ url, label, large }) {
  return <div className={`avatar ${large ? "large" : ""}`}>{url ? <img src={url} alt="" /> : <span>{(label || "A").slice(0, 1).toUpperCase()}</span>}</div>;
}

function Progress({ value }) {
  return <div className="soft-progress"><span style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div>;
}

function useTotals(transactions) {
  return useMemo(() => {
  const allowanceLinked = transactions
      .filter((entry) => entry.type !== "allowance" && entry.counts_as_allowance)
      .reduce((sum, entry) => sum + allowanceAmountValue(entry), 0);
    const directAllowance = transactions
      .filter((entry) => normalizeFinanceType(entry.type) === "allowance" && (!sourceCanStaySeparate(entry.source_type) || entry.counts_as_allowance))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return {
      allowance: directAllowance + allowanceLinked,
      income: byType(transactions, "income"),
      spending: byType(transactions, "spending"),
      savings: byType(transactions, "savings"),
    };
  }, [transactions]);
}

export default function App() {
  return <AuthProvider><InnerApp /></AuthProvider>;
}
