import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type ChartDatum = {
  name: string;
  value?: number;
  quantity?: number;
};

const EMPLOYEE_COLORS = ["#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7"];
const PRODUCT_COLORS = ["#0ea5e9", "#22c55e", "#facc15", "#fb923c", "#f97373"];

function formatCurrency(value: number) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ReportsChartsProps = {
  customerChartData: ChartDatum[];
  productChartData: ChartDatum[];
};

const ReportsCharts: React.FC<ReportsChartsProps> = ({ customerChartData, productChartData }) => {
  if (customerChartData.length === 0 && productChartData.length === 0) return null;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-gray-100 p-4 shadow-sm flex flex-col">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Distribuição do faturamento por cliente
        </h3>
        <p className="text-[11px] text-gray-500 mb-4">
          Quanto cada cliente representa do total em R$ no período selecionado.
        </p>

        {customerChartData.length === 0 ? (
          <p className="text-xs text-gray-500">Ainda não há dados suficientes para o gráfico.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {customerChartData.map((_, index) => (
                    <Cell key={`cell-customer-${index}`} fill={EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => formatCurrency(Number(value || 0))} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/90 backdrop-blur-sm border border-gray-100 p-4 shadow-sm flex flex-col">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Quantidade por produto (Top pedidos)
        </h3>
        <p className="text-[11px] text-gray-500 mb-4">
          Comparativo de unidades vendidas entre os produtos mais pedidos no período.
        </p>

        {productChartData.length === 0 ? (
          <p className="text-xs text-gray-500">Ainda não há dados suficientes para o gráfico.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickMargin={8} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip />
                <Bar dataKey="quantity" radius={[6, 6, 0, 0]}>
                  {productChartData.map((_, index) => (
                    <Cell key={`cell-prod-${index}`} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
};

export default ReportsCharts;
