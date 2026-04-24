import { requireSupabase } from "./supabaseClient";
import { monthKey, monthStart, nextMonthStart, normalizeFinanceType } from "../utils/format";

export async function getMyProfile(userId) {
  const { data, error } = await requireSupabase().from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function saveProfile(profile) {
  const { data, error } = await requireSupabase().from("profiles").upsert(profile).select().single();
  if (error) throw error;
  return data;
}

export async function uploadPublicFile(bucket, userId, file) {
  if (!file) return "";
  const ext = file.name.split(".").pop() || "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function listFinanceData(userId, month = monthStart()) {
  const supabase = requireSupabase();
  const monthEnd = nextMonthStart(monthKey(month));
  const [categories, transactions, budgets, stocks, wishlistItems, sharePreferences] = await Promise.all([
    supabase.from("categories").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("transactions").select("*, categories(name, icon_url)").eq("user_id", userId).gte("date", month).lt("date", monthEnd).order("date", { ascending: false }),
    supabase.from("budgets").select("*, categories(name)").eq("user_id", userId).eq("month", month).order("created_at"),
    supabase.from("stock_watchlists").select("*").eq("user_id", userId).order("symbol"),
    supabase.from("wishlist_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("user_share_preferences").select("*").eq("user_id", userId).order("section_key"),
  ]);
  for (const result of [categories, transactions, budgets, stocks, wishlistItems, sharePreferences]) if (result.error) throw result.error;
  return {
    categories: categories.data || [],
    transactions: transactions.data || [],
    budgets: budgets.data || [],
    stocks: stocks.data || [],
    wishlistItems: wishlistItems.data || [],
    sharePreferences: sharePreferences.data || [],
  };
}

export async function listSummaryData(userId) {
  const supabase = requireSupabase();
  const [transactions, budgets] = await Promise.all([
    supabase.from("transactions").select("*, categories(name, icon_url)").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("budgets").select("*, categories(name)").eq("user_id", userId).order("month", { ascending: false }),
  ]);
  for (const result of [transactions, budgets]) if (result.error) throw result.error;
  return {
    transactions: transactions.data || [],
    budgets: budgets.data || [],
  };
}

export async function createStarterCategories(userId) {
  const starter = [
    ["allowance", "Allowance"],
    ["income", "Part-time Work"],
    ["income", "Gifts"],
    ["spending", "Food"],
    ["spending", "Transport"],
    ["spending", "Shopping"],
    ["spending", "School"],
    ["savings", "Travel Fund"],
    ["savings", "Emergency Fund"],
  ].map(([type, name]) => ({ user_id: userId, type, name }));
  const { error } = await requireSupabase().from("categories").insert(starter);
  if (error) throw error;
}

export async function saveCategory(category) {
  const payload = {
    id: category.id,
    user_id: category.user_id,
    type: normalizeFinanceType(category.type),
    name: category.name,
    icon_url: category.icon_url || null,
  };
  const { data, error } = await requireSupabase().from("categories").upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await requireSupabase().from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function saveTransaction(transaction) {
  const payload = {
    id: transaction.id,
    user_id: transaction.user_id,
    type: normalizeFinanceType(transaction.type),
    category_id: transaction.category_id,
    title: transaction.title || "",
    image_url: transaction.image_url || null,
    source_type: transaction.source_type || "allowance",
    counts_as_allowance: Boolean(transaction.counts_as_allowance),
    source_amount: transaction.source_amount === "" || transaction.source_amount === undefined ? null : transaction.source_amount,
    allowance_amount: transaction.allowance_amount === "" || transaction.allowance_amount === undefined ? null : transaction.allowance_amount,
    amount: transaction.amount,
    note: transaction.note || "",
    date: transaction.date,
  };
  const { data, error } = await requireSupabase().from("transactions").upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await requireSupabase().from("transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function saveBudget(budget) {
  const payload = {
    id: budget.id,
    user_id: budget.user_id,
    type: normalizeFinanceType(budget.type),
    category_id: budget.category_id || null,
    name: budget.name || "",
    target_amount: budget.target_amount,
    month: budget.month,
    is_public_goal: Boolean(budget.is_public_goal),
  };
  const { data, error } = await requireSupabase().from("budgets").upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  const { error } = await requireSupabase().from("budgets").delete().eq("id", id);
  if (error) throw error;
}

export async function listUsers(search = "") {
  const query = requireSupabase()
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, is_public")
    .eq("is_public", true)
    .limit(20);
  if (search) query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function followUser(followerId, followingId) {
  const { error } = await requireSupabase().from("follows").insert({ follower_id: followerId, following_id: followingId });
  if (error) throw error;
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await requireSupabase().from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (error) throw error;
}

export async function listFollowingIds(userId) {
  const { data, error } = await requireSupabase().from("follows").select("following_id").eq("follower_id", userId);
  if (error) throw error;
  return (data || []).map((row) => row.following_id);
}

export async function getSocialCounts(userId) {
  const supabase = requireSupabase();
  const [followers, following] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count || 0, following: following.count || 0 };
}

export async function getFeed(userId) {
  const supabase = requireSupabase();
  const { data: follows, error: followsError } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  if (followsError) throw followsError;
  const ids = (follows || []).map((row) => row.following_id);
  if (!ids.length) return [];
  const [profiles, sharePreferences, transactions, wishlistItems] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids).eq("is_public", true),
    supabase.from("user_share_preferences").select("user_id, section_key").in("user_id", ids),
    supabase.from("transactions").select("id, user_id, type, title, amount, note, date").in("user_id", ids).order("date", { ascending: false }).limit(200),
    supabase.from("wishlist_items").select("id, user_id, name, image_url, target_price, saved_amount, note, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [profiles, sharePreferences, transactions, wishlistItems]) if (result.error) throw result.error;

  const preferencesByUser = new Map();
  for (const row of sharePreferences.data || []) {
    const current = preferencesByUser.get(row.user_id) || [];
    current.push(row.section_key);
    preferencesByUser.set(row.user_id, current);
  }

  const transactionsByUser = new Map();
  for (const row of transactions.data || []) {
    const current = transactionsByUser.get(row.user_id) || [];
    current.push(row);
    transactionsByUser.set(row.user_id, current);
  }

  const wishlistByUser = new Map();
  for (const row of wishlistItems.data || []) {
    const current = wishlistByUser.get(row.user_id) || [];
    current.push(row);
    wishlistByUser.set(row.user_id, current);
  }

  return (profiles.data || []).map((profile) => ({
    profile,
    sharedSections: preferencesByUser.get(profile.id) || [],
    transactions: transactionsByUser.get(profile.id) || [],
    wishlistItems: wishlistByUser.get(profile.id) || [],
  }));
}

export async function addActivity(activity) {
  const activityType = activity.activity_type || activity.type;
  const payload = {
    id: activity.id,
    user_id: activity.user_id,
    activity_type: activityType,
    title: activity.title || "",
    body: activity.body || "",
    is_public: activity.is_public !== undefined ? Boolean(activity.is_public) : true,
  };
  const { error } = await requireSupabase().from("activities").insert(payload);
  if (error) throw error;
}

export async function saveWishlistItem(item) {
  const payload = {
    id: item.id,
    user_id: item.user_id,
    name: item.name,
    image_url: item.image_url || null,
    target_price: item.target_price,
    saved_amount: item.saved_amount,
    note: item.note || "",
  };
  const { data, error } = await requireSupabase().from("wishlist_items").upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteWishlistItem(id) {
  const { error } = await requireSupabase().from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
}

export async function replaceSharePreferences(userId, sectionKeys) {
  const supabase = requireSupabase();
  const { error: deleteError } = await supabase.from("user_share_preferences").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  if (!sectionKeys.length) return [];
  const rows = sectionKeys.map((sectionKey) => ({ user_id: userId, section_key: sectionKey }));
  const { data, error } = await supabase.from("user_share_preferences").insert(rows).select();
  if (error) throw error;
  return data || [];
}
