import type { DashboardRetryActivityDay } from "@paperclipai/shared";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface RetryTrendChartProps {
  activity: DashboardRetryActivityDay[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload) return null;
  
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-1.5">
        {payload[0]?.payload?.dateDisplay}
      </p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <p key={entry.dataKey} className="text-xs tabular-nums" style={{ color: entry.color }}>
            <span className="font-medium">{entry.name}:</span> {entry.value}
          </p>
        ))}
      </div>
    </div>
  );
}

export function RetryTrendChart({ activity }: RetryTrendChartProps) {
  // Prepare data for recharts
  const data = activity.map((day) => ({
    date: day.date,
    dateDisplay: formatDate(day.date),
    recovered: day.recovered,
    failedAfterRetries: day.failedAfterRetries,
    exhausted: day.exhausted,
  }));

  const hasData = activity.some(
    (v) => v.recovered > 0 || v.failedAfterRetries > 0 || v.exhausted > 0
  );

  if (!hasData) {
    return <p className="text-xs text-muted-foreground">No retry activity</p>;
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 25 }}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="dateDisplay"
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: "11px" }}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: "11px" }}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: "16px" }}
            iconType="line"
            height={32}
          />
          <Line
            type="monotone"
            dataKey="recovered"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Recovered"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="failedAfterRetries"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Failed after retry"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="exhausted"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Exhausted"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
