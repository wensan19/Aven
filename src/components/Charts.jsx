import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, money } from "../utils/format";
import { EmptyState } from "./ui/EmptyState";

const COMPARISON_BAR_COLORS = {
  income: { current: "#b9a7f5", previous: "rgba(185,167,245,.28)" },
  allowance: { current: "#f5a9bd", previous: "rgba(245,169,189,.3)" },
  default: { current: "#78aee4", previous: "rgba(120,174,228,.26)" },
};

function comparisonColor(type, period) {
  return (COMPARISON_BAR_COLORS[type] || COMPARISON_BAR_COLORS.default)[period];
}

export function FinanceChart({ data, type }) {
  if (!data.length) return <EmptyState title="No chart data">Add a transaction and your chart will appear here.</EmptyState>;

  return (
    <div className="chart-card">
      <ResponsiveContainer width="100%" height={340}>
        {type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(114,145,180,.24)" />
            <XAxis dataKey="name" tick={{ fill: "#6d7b8f", fontSize: 12 }} />
            <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "#6d7b8f", fontSize: 12 }} />
            <Tooltip formatter={(value) => money(value)} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {data.map((_entry, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={72} outerRadius={116} paddingAngle={3}>
              {data.map((_entry, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => money(value)} />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryComparisonChart({ data, currentLabel, previousLabel }) {
  if (!data.length) {
    return <EmptyState title="No category trend yet">Add transactions in this period and Aven will compare them by category.</EmptyState>;
  }

  return (
    <div className="chart-card">
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} barGap={-24} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(114,145,180,.24)" />
          <XAxis dataKey="name" tick={{ fill: "#6d7b8f", fontSize: 12 }} interval={0} angle={-18} textAnchor="end" height={70} />
          <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "#6d7b8f", fontSize: 12 }} />
          <Tooltip formatter={(value) => money(value)} />
          <Legend />
          <Bar name={previousLabel || "Previous period"} dataKey="previous" radius={[8, 8, 0, 0]} barSize={34}>
            {data.map((entry, index) => (
              <Cell key={`previous-${index}`} fill={comparisonColor(entry.type, "previous")} />
            ))}
          </Bar>
          <Bar name={currentLabel || "Current period"} dataKey="current" radius={[8, 8, 0, 0]} barSize={22}>
            {data.map((entry, index) => (
              <Cell key={`current-${index}`} fill={comparisonColor(entry.type, "current")} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StockLineChart({ points }) {
  if (!points?.length) return <EmptyState title="No price history">Choose a stock and range to load recent prices.</EmptyState>;
  return (
    <div className="chart-card">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(114,145,180,.24)" />
          <XAxis dataKey="datetime" hide />
          <YAxis domain={["dataMin", "dataMax"]} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} tick={{ fill: "#6d7b8f", fontSize: 12 }} />
          <Tooltip formatter={(value) => money(value)} />
          <Bar dataKey="close" fill="#78aee4" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
