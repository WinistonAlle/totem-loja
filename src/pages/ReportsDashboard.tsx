import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

import {
  Home,
  BarChart2,
  Loader2,
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  CalendarRange,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/* --------------------------------------------------------
   TYPES (schema alinhado)
-------------------------------------------------------- */
type OrderItem = {
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null; // ✅ definitivo
};

type RawOrder = {
  id: string;
  customer_document: string | null;
  customer_name: string | null;
  total_items: number | null;
  total_value: number | null;
  status: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

type Summary = {
  totalOrders: number;
  totalRevenue: number;
  totalItems: number;
  avgTicket: number;
};

type CustomerSummary = {
  document: string | null;
  name: string;
  totalValue: number;
  totalOrders: number;
};

type ProductSummary = {
  productId: string | null;
  productName: string;
  totalQuantity: number;
  totalValue: number;
};

type DailySummary = {
  totalOrdersToday: number;
  totalRevenueToday: number;
  totalItemsToday: number;
};

type PeriodRange = "mes_atual" | "mes_anterior" | "ultimos_90";

type SimpleOrder = {
  id: string;
  created_at: string;
  total_items: number | null;
  total_value: number | null;
  status: string | null;
};

/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
const formatCurrency = (value: number) =>
  (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const shortenLabel = (name: string, max = 16) => {
  if (!name) return "";
  return name.length > max ? name.slice(0, max) + "…" : name;
};

/* --------- COMPARAÇÃO DE MESES --------- */
type MonthOption = {
  label: string;
  value: string; // "YYYY-MM"
  year: number;
  monthIndex: number; // 0-11
};

const buildLastMonthsOptions = (count = 12): MonthOption[] => {
  const now = new Date();
  const options: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    options.push({ label, value, year, monthIndex });
  }
  return options;
};

const getMonthStartEnd = (value: string): { start: Date; end: Date } => {
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return { start, end };
};

const buildSummaryFromOrders = (orders: any[]): Summary => {
  const totalOrders = orders.length;
  let totalRevenue = 0;
  let totalItems = 0;

  for (const o of orders) {
    totalRevenue += Number(o.total_value ?? 0);
    totalItems += Number(o.total_items ?? 0);
  }

  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return { totalOrders, totalRevenue, totalItems, avgTicket };
};

const initialMonthOptions = buildLastMonthsOptions();
const ReportsCharts = lazy(() => import("@/components/reports/ReportsCharts"));
/* -------------------------------------- */

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();

  // ✅ LOJA FÍSICA: quem acessa é usuário autenticado do painel
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        navigate("/login", { replace: true });
        return;
      }
      setAuthReady(true);
    };
    check();
  }, [navigate]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [comparisonSummary, setComparisonSummary] = useState<Summary | null>(null);

  const [topCustomers, setTopCustomers] = useState<CustomerSummary[]>([]);
  const [topProducts, setTopProducts] = useState<ProductSummary[]>([]);

  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  const [ordersRaw, setOrdersRaw] = useState<RawOrder[]>([]);
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);

  const [selectedRange, setSelectedRange] = useState<PeriodRange>("mes_atual");

  // Drill-down: cliente
  const [customerDrill, setCustomerDrill] = useState<{ document: string | null; name: string } | null>(null);
  const [customerOrders, setCustomerOrders] = useState<SimpleOrder[]>([]);
  const [customerDrillLoading, setCustomerDrillLoading] = useState(false);

  // comparação de meses
  const [monthOptions] = useState<MonthOption[]>(initialMonthOptions);
  const [compareMonth1, setCompareMonth1] = useState<string>(initialMonthOptions[0]?.value ?? "");
  const [compareMonth2, setCompareMonth2] = useState<string>(
    initialMonthOptions[1]?.value ?? initialMonthOptions[0]?.value ?? ""
  );
  const [monthComparison, setMonthComparison] = useState<{ month1: Summary; month2: Summary } | null>(null);
  const [monthComparisonLoading, setMonthComparisonLoading] = useState(false);
  const [monthComparisonError, setMonthComparisonError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        const now = new Date();

        let rangeStart: Date;
        let rangeEnd: Date;

        if (selectedRange === "mes_atual") {
          rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
          rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        } else if (selectedRange === "mes_anterior") {
          const firstDayCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
          const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          rangeStart = firstDayPrev;
          rangeEnd = firstDayCurrent;
        } else {
          rangeEnd = new Date();
          rangeStart = new Date();
          rangeStart.setDate(rangeStart.getDate() - 90);
        }

        setCurrentRange({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() });

        // ✅ SELECT alinhado (SEM subtotal / SEM total_value em order_items)
        const { data, error } = await supabase
          .from("orders")
          .select(
            `
            id,
            customer_document,
            customer_name,
            total_items,
            total_value,
            status,
            created_at,
            order_items (
              product_id,
              product_name,
              quantity,
              unit_price,
              total_price
            )
          `
          )
          .gte("created_at", rangeStart.toISOString())
          .lt("created_at", rangeEnd.toISOString());

        if (error) {
          console.error("Erro ao carregar dashboard:", error);
          setError(error.message || "Erro ao carregar dados do dashboard.");
          return;
        }

        const orders: RawOrder[] = (data as any[]) ?? [];
        setOrdersRaw(orders);

        let totalRevenue = 0;
        let totalItems = 0;

        const customerMap = new Map<string, CustomerSummary>();
        const prodMap = new Map<string, ProductSummary>();

        for (const o of orders) {
          const orderValue = Number(o.total_value ?? 0);
          const itemsCount = Number(o.total_items ?? 0);

          totalRevenue += orderValue;
          totalItems += itemsCount;

          // clientes
          const docKey = o.customer_document || "sem-doc";
          const existing =
            customerMap.get(docKey) ??
            ({
              document: o.customer_document ?? null,
              name: o.customer_name ?? o.customer_document ?? "Cliente não identificado",
              totalValue: 0,
              totalOrders: 0,
            } as CustomerSummary);

          existing.totalValue += orderValue;
          existing.totalOrders += 1;
          customerMap.set(docKey, existing);

          // produtos (usa total_price ✅)
          (o.order_items ?? []).forEach((it) => {
            const pKey =
              it.product_id !== null && it.product_id !== undefined
                ? String(it.product_id)
                : it.product_name ?? "sem-produto";

            const prodExisting =
              prodMap.get(pKey) ??
              ({
                productId: it.product_id ?? null,
                productName: it.product_name ?? "Produto sem nome",
                totalQuantity: 0,
                totalValue: 0,
              } as ProductSummary);

            prodExisting.totalQuantity += Number(it.quantity ?? 0);
            prodExisting.totalValue += Number(it.total_price ?? 0);
            prodMap.set(pKey, prodExisting);
          });
        }

        const totalOrders = orders.length;
        const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        setSummary({ totalOrders, totalRevenue, totalItems, avgTicket });

        const customerList = Array.from(customerMap.values()).sort((a, b) => b.totalValue - a.totalValue);
        const prodList = Array.from(prodMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);

        setTopCustomers(customerList.slice(0, 5));
        setTopProducts(prodList.slice(0, 5));

        // comparação com período anterior
        const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
        const compEnd = new Date(rangeStart);
        const compStart = new Date(compEnd.getTime() - rangeMs);

        const { data: compData, error: compError } = await supabase
          .from("orders")
          .select("id, total_items, total_value, created_at")
          .gte("created_at", compStart.toISOString())
          .lt("created_at", compEnd.toISOString());

        if (compError) {
          console.error("Erro ao carregar período de comparação:", compError);
          setComparisonSummary(null);
        } else {
          const compOrders: any[] = compData ?? [];
          setComparisonSummary(buildSummaryFromOrders(compOrders));
        }

        // resumo do dia (sempre hoje)
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const tomorrow = new Date(todayStart);
        tomorrow.setDate(todayStart.getDate() + 1);

        const { data: todayOrders, error: todayError } = await supabase
          .from("orders")
          .select("id, total_items, total_value, created_at")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", tomorrow.toISOString());

        if (todayError) {
          console.error("Erro ao carregar resumo do dia:", todayError);
          setDailySummary(null);
        } else {
          const list = (todayOrders as any[]) ?? [];
          const totalOrdersToday = list.length;
          let totalRevenueToday = 0;
          let totalItemsToday = 0;

          for (const o of list) {
            totalRevenueToday += Number(o.total_value ?? 0);
            totalItemsToday += Number(o.total_items ?? 0);
          }

          setDailySummary({ totalOrdersToday, totalRevenueToday, totalItemsToday });
        }
      } catch (err: any) {
        console.error("Erro inesperado ao carregar dashboard:", err);
        setError(err?.message || "Ocorreu um erro inesperado ao carregar o dashboard.");
      } finally {
        setLoading(false);
      }
    }

    if (authReady) loadDashboard();
  }, [selectedRange, authReady]);

  // comparação de meses
  useEffect(() => {
    const loadMonthComparison = async () => {
      if (!compareMonth1 || !compareMonth2) return;

      setMonthComparisonLoading(true);
      setMonthComparisonError(null);

      try {
        const { start: start1, end: end1 } = getMonthStartEnd(compareMonth1);
        const { start: start2, end: end2 } = getMonthStartEnd(compareMonth2);

        const [res1, res2] = await Promise.all([
          supabase
            .from("orders")
            .select("id, total_items, total_value, created_at")
            .gte("created_at", start1.toISOString())
            .lt("created_at", end1.toISOString()),
          supabase
            .from("orders")
            .select("id, total_items, total_value, created_at")
            .gte("created_at", start2.toISOString())
            .lt("created_at", end2.toISOString()),
        ]);

        if (res1.error || res2.error) {
          console.error("Erro ao carregar comparação de meses:", { error1: res1.error, error2: res2.error });
          setMonthComparison(null);
          setMonthComparisonError("Não foi possível carregar a comparação entre os meses selecionados.");
          return;
        }

        const orders1: any[] = (res1.data as any[]) ?? [];
        const orders2: any[] = (res2.data as any[]) ?? [];

        setMonthComparison({
          month1: buildSummaryFromOrders(orders1),
          month2: buildSummaryFromOrders(orders2),
        });
      } catch (err) {
        console.error("Erro inesperado na comparação de meses:", err);
        setMonthComparison(null);
        setMonthComparisonError("Ocorreu um erro inesperado ao comparar os meses.");
      } finally {
        setMonthComparisonLoading(false);
      }
    };

    if (authReady) loadMonthComparison();
  }, [compareMonth1, compareMonth2, authReady]);

  const now = new Date();
  const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const todayLabel = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  const customerChartData = useMemo(
    () =>
      topCustomers.map((c) => ({
        name: c.name,
        value: Number(c.totalValue || 0),
      })),
    [topCustomers]
  );

  const productChartData = useMemo(
    () =>
      topProducts.map((prod) => ({
        name: shortenLabel(prod.productName),
        quantity: Number(prod.totalQuantity || 0),
      })),
    [topProducts]
  );

  const rangeLabel = useMemo(() => {
    if (selectedRange === "mes_atual") return "Mês atual";
    if (selectedRange === "mes_anterior") return "Mês anterior";
    return "Últimos 90 dias";
  }, [selectedRange]);

  // exportar CSV
  const handleExportCSV = () => {
    if (!ordersRaw || ordersRaw.length === 0) return;

    const header = ["id", "data", "hora", "cliente_nome", "cliente_documento", "total_itens", "total_valor", "status"];

    const rows = ordersRaw.map((o) => {
      const date = new Date(o.created_at);
      const dataStr = date.toLocaleDateString("pt-BR");
      const horaStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      return [
        o.id,
        dataStr,
        horaStr,
        o.customer_name ?? "",
        o.customer_document ?? "",
        o.total_items ?? 0,
        Number(o.total_value ?? 0).toFixed(2).replace(".", ","),
        o.status ?? "",
      ];
    });

    const csvContent = [header, ...rows]
      .map((r) =>
        r
          .map((cell) => {
            const value = String(cell ?? "");
            const escaped = value.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    const dateLabel = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.href = url;
    link.setAttribute("download", `relatorio_pedidos_${dateLabel}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // exportar PDF
  const handleExportPDF = async () => {
    if (!summary) return;

    const [{ default: jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleString("pt-BR");

    doc.setFontSize(16);
    doc.text("Relatório de Pedidos - Loja Física", 14, 18);

    doc.setFontSize(10);
    doc.text(`Gerado em: ${dateStr}`, 14, 26);
    doc.text(`Período: ${rangeLabel}`, 14, 31);

    doc.setFontSize(12);
    doc.text("Resumo do período", 14, 40);

    doc.setFontSize(10);
    doc.text(`Pedidos: ${summary.totalOrders}`, 14, 46);
    doc.text(`Faturamento: ${formatCurrency(summary.totalRevenue)}`, 14, 51);
    doc.text(`Itens vendidos: ${summary.totalItems}`, 14, 56);
    doc.text(`Ticket médio: ${formatCurrency(summary.avgTicket)}`, 14, 61);

    let currentY = 70;

    if (dailySummary) {
      doc.setFontSize(12);
      doc.text("Resumo de hoje", 14, currentY);
      currentY += 6;

      doc.setFontSize(10);
      doc.text(`Pedidos hoje: ${dailySummary.totalOrdersToday}`, 14, currentY); currentY += 5;
      doc.text(`Faturamento hoje: ${formatCurrency(dailySummary.totalRevenueToday)}`, 14, currentY); currentY += 5;
      doc.text(`Itens vendidos hoje: ${dailySummary.totalItemsToday}`, 14, currentY); currentY += 8;
    }

    if (topCustomers.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [["#", "Cliente", "Documento", "Pedidos", "Total (R$)"]],
        body: topCustomers.map((c, index) => [
          index + 1,
          c.name,
          c.document ?? "",
          c.totalOrders,
          Number(c.totalValue ?? 0).toFixed(2).replace(".", ","),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [239, 68, 68] },
        theme: "striped",
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    if (topProducts.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [["#", "Produto", "Qtd", "Total (R$)"]],
        body: topProducts.map((p, index) => [
          index + 1,
          p.productName,
          p.totalQuantity,
          Number(p.totalValue ?? 0).toFixed(2).replace(".", ","),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [56, 189, 248] },
        theme: "striped",
      });
    }

    const dateLabel = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    doc.save(`relatorio_loja_${dateLabel}.pdf`);
  };

  // drill-down cliente
  const openCustomerDrill = async (c: CustomerSummary) => {
    if (!currentRange) return;

    setCustomerDrill({ document: c.document ?? null, name: c.name });
    setCustomerDrillLoading(true);

    try {
      let query = supabase
        .from("orders")
        .select("id, total_items, total_value, status, created_at")
        .gte("created_at", currentRange.start)
        .lt("created_at", currentRange.end)
        .order("created_at", { ascending: false });

      if (c.document) query = query.eq("customer_document", c.document);

      const { data, error } = await query;
      if (error) throw error;

      setCustomerOrders((data as any[]) ?? []);
    } catch (err) {
      console.error("Erro ao carregar pedidos do cliente:", err);
      setCustomerOrders([]);
    } finally {
      setCustomerDrillLoading(false);
    }
  };

  const closeCustomerDrill = () => {
    setCustomerDrill(null);
    setCustomerOrders([]);
  };

  if (!authReady) return null;

  const month1Label = monthOptions.find((m) => m.value === compareMonth1)?.label || "Mês A";
  const month2Label = monthOptions.find((m) => m.value === compareMonth2)?.label || "Mês B";

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 via-white to-gray-50 flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-red-100/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/catalogo")}
              className="rounded-full p-2 hover:bg-red-50 border border-red-100 transition"
              aria-label="Voltar para o catálogo"
            >
              <Home className="h-5 w-5 text-red-600" />
            </button>

            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-red-500 font-semibold">
                Painel do catálogo
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <BarChart2 className="h-4 w-4 text-red-600" />
                <h1 className="text-sm md:text-base font-semibold text-gray-900">
                  Relatórios de pedidos
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 capitalize">
                  <CalendarRange className="h-3 w-3" />
                  {monthName}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[11px] text-gray-400">Acesso restrito</span>
            <span className="text-xs font-medium text-gray-700">Usuário autenticado</span>
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600 text-sm">
            <div className="flex items-center justify-center w-12 h-12 rounded-full border border-red-100 bg-white shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-red-600" />
            </div>
            <p>Carregando dados do dashboard...</p>
            <p className="text-[11px] text-gray-400">Buscando pedidos no Supabase</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800 shadow-sm">
            <p className="font-semibold mb-1">Não foi possível carregar os dados do dashboard.</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        )}

        {!loading && !error && summary && (
          <>
            {/* Visão geral + filtro + ações */}
            <section className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-semibold text-gray-800">Visão geral do período</h2>
                  <span className="text-[11px] text-gray-500">
                    Período selecionado:{" "}
                    <span className="font-medium text-gray-700">{rangeLabel}</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-end">
                  {/* Exportações */}
                  <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 text-[11px] shadow-sm">
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full hover:bg-gray-50 transition"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      CSV / Excel
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full hover:bg-gray-50 transition border-l border-gray-200"
                    >
                      <FileText className="h-3 w-3" />
                      PDF
                    </button>
                  </div>

                  {/* Filtro de período */}
                  <div className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 text-[11px] shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedRange("mes_atual")}
                      className={`px-3 py-1 rounded-full transition ${
                        selectedRange === "mes_atual"
                          ? "bg-red-500 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Mês atual
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRange("mes_anterior")}
                      className={`px-3 py-1 rounded-full transition ${
                        selectedRange === "mes_anterior"
                          ? "bg-red-500 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Mês anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRange("ultimos_90")}
                      className={`px-3 py-1 rounded-full transition ${
                        selectedRange === "ultimos_90"
                          ? "bg-red-500 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Últimos 90 dias
                    </button>
                  </div>
                </div>
              </div>

              {/* Cards resumo do período */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-red-100 shadow-sm shadow-red-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Pedidos no período</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.totalOrders}</p>
                      <p className="text-[11px] text-gray-400 mt-1">Total de pedidos gerados</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                      <ShoppingBag className="h-4 w-4 text-red-600" />
                    </div>
                  </div>
                  {comparisonSummary && (
                    <ComparisonBadge
                      current={summary.totalOrders}
                      previous={comparisonSummary.totalOrders}
                      label="vs período anterior"
                    />
                  )}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-emerald-100 shadow-sm shadow-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Faturamento</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(summary.totalRevenue)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">Soma do valor de todos os pedidos</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    </div>
                  </div>
                  {comparisonSummary && (
                    <ComparisonBadge
                      current={summary.totalRevenue}
                      previous={comparisonSummary.totalRevenue}
                      money
                      label="vs período anterior"
                    />
                  )}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-sky-100 shadow-sm shadow-sky-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Itens vendidos</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.totalItems}</p>
                      <p className="text-[11px] text-gray-400 mt-1">Quantidade total pedida</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center border border-sky-100">
                      <Package className="h-4 w-4 text-sky-600" />
                    </div>
                  </div>
                  {comparisonSummary && (
                    <ComparisonBadge
                      current={summary.totalItems}
                      previous={comparisonSummary.totalItems}
                      label="vs período anterior"
                    />
                  )}
                </div>

                <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-100 shadow-sm shadow-amber-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Ticket médio</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(summary.avgTicket)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">Valor médio por pedido</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center border border-amber-100">
                      <BarChart2 className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                  {comparisonSummary && (
                    <ComparisonBadge
                      current={summary.avgTicket}
                      previous={comparisonSummary.avgTicket}
                      money
                      label="vs período anterior"
                    />
                  )}
                </div>
              </div>
            </section>

            {/* Top clientes e produtos */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-white/85 backdrop-blur-sm border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                      <Users className="h-4 w-4 text-red-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800">Clientes que mais compraram (R$)</h3>
                  </div>
                  {topCustomers.length > 0 && (
                    <span className="text-[11px] text-gray-400">Top {topCustomers.length} · Clique para detalhes</span>
                  )}
                </div>

                {topCustomers.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum pedido registrado nesse período.</p>
                ) : (
                  <ul className="space-y-2">
                    {topCustomers.map((c, index) => {
                      const max = topCustomers[0]?.totalValue || 1;
                      const perc = Math.round((c.totalValue / max) * 100);

                      return (
                        <li
                          key={c.document ?? index}
                          className="text-xs rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 cursor-pointer hover:bg-gray-100/70 transition"
                          onClick={() => openCustomerDrill(c)}
                        >
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white font-semibold">
                                {index + 1}
                              </span>
                              <span className="font-medium text-gray-800 truncate">{c.name}</span>
                            </div>
                            <span className="text-gray-700 font-medium">{formatCurrency(c.totalValue)}</span>
                          </div>

                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400"
                              style={{ width: `${perc}%` }}
                            />
                          </div>

                          <p className="mt-1 text-[10px] text-gray-500 flex justify-between">
                            <span>{c.totalOrders} pedido(s) no período</span>
                            {c.document && <span className="font-mono opacity-70">DOC: {c.document}</span>}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl bg-white/85 backdrop-blur-sm border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sky-50 flex items-center justify-center border border-sky-100">
                      <Package className="h-4 w-4 text-sky-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800">Produtos mais pedidos (Qtd)</h3>
                  </div>
                  {topProducts.length > 0 && (
                    <span className="text-[11px] text-gray-400">Top {topProducts.length}</span>
                  )}
                </div>

                {topProducts.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum item registrado nesse período.</p>
                ) : (
                  <ul className="space-y-2">
                    {topProducts.map((prod, index) => {
                      const max = topProducts[0]?.totalQuantity || 1;
                      const perc = Math.round((prod.totalQuantity / max) * 100);

                      return (
                        <li
                          key={prod.productId ?? prod.productName ?? index}
                          className="text-xs rounded-xl border border-gray-100 bg-gray-50/60 p-2.5"
                        >
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-[10px] text-white font-semibold">
                                {index + 1}
                              </span>
                              <span className="font-medium text-gray-800 truncate">{prod.productName}</span>
                            </div>
                            <span className="text-gray-700 font-medium whitespace-nowrap">
                              {prod.totalQuantity} un.
                            </span>
                          </div>

                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                              style={{ width: `${perc}%` }}
                            />
                          </div>

                          <p className="mt-1 text-[10px] text-gray-500 flex justify-between">
                            <span>Total em pedidos: {formatCurrency(prod.totalValue)}</span>
                            {prod.productId && <span className="font-mono opacity-70">ID: {String(prod.productId)}</span>}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Gráficos */}
            {(customerChartData.length > 0 || productChartData.length > 0) && (
              <Suspense
                fallback={
                  <div className="rounded-2xl bg-white/90 border border-gray-100 p-4 text-sm text-gray-500">
                    Carregando gráficos...
                  </div>
                }
              >
                <ReportsCharts
                  customerChartData={customerChartData}
                  productChartData={productChartData}
                />
              </Suspense>
            )}
          </>
        )}
      </main>

      {/* DIALOG: DRILL-DOWN CLIENTE */}
      <Dialog open={!!customerDrill} onOpenChange={closeCustomerDrill}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Pedidos do cliente</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Mostrando os pedidos desse cliente no período selecionado no dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg bg-gray-50 px-3 py-2 mb-3 text-xs text-gray-700 flex flex-col gap-1">
            <span className="font-semibold">{customerDrill?.name ?? "Cliente não identificado"}</span>
            {customerDrill?.document && (
              <span className="font-mono text-[11px] text-gray-500">DOC: {customerDrill.document}</span>
            )}
          </div>

          <div className="flex-1 overflow-auto rounded-lg border border-gray-100 bg-white">
            {customerDrillLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando pedidos do cliente...
              </div>
            ) : customerOrders.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-xs text-gray-500">
                Nenhum pedido encontrado para esse cliente no período.
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Hora</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Pedido</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Itens</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Valor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((o) => {
                    const d = new Date(o.created_at);
                    const dataStr = d.toLocaleDateString("pt-BR");
                    const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                    return (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                        <td className="px-3 py-2">{dataStr}</td>
                        <td className="px-3 py-2">{horaStr}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{o.id}</td>
                        <td className="px-3 py-2 text-right">{o.total_items ?? 0}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(Number(o.total_value ?? 0))}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                            {o.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* --------------------------------------------------------
   ComparisonBadge
-------------------------------------------------------- */
type ComparisonBadgeProps = {
  current: number;
  previous: number;
  label?: string;
  money?: boolean;
};

const ComparisonBadge: React.FC<ComparisonBadgeProps> = ({
  current,
  previous,
  label = "vs período anterior",
  money = false,
}) => {
  const previousValid = previous ?? 0;

  if (previousValid === 0 && current === 0) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
        <Minus className="h-3 w-3" />
        Sem variação ({label})
      </div>
    );
  }

  if (previousValid === 0 && current !== 0) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
        <ArrowUpRight className="h-3 w-3" />
        Crescimento em relação a período sem registro ({label})
      </div>
    );
  }

  const diff = current - previousValid;
  const percent = (diff / previousValid) * 100;
  const isUp = diff > 0;
  const isDown = diff < 0;

  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const baseText = money ? `${formatCurrency(Math.abs(diff))}` : `${Math.abs(diff).toFixed(0)}`;

  return (
    <div
      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
        isUp
          ? "bg-emerald-50 text-emerald-700"
          : isDown
          ? "bg-red-50 text-red-700"
          : "bg-gray-50 text-gray-500"
      }`}
    >
      <Icon className="h-3 w-3" />
      <span>
        {isUp ? "+" : isDown ? "-" : "0"} {baseText} ({percent.toFixed(1)}%) · {label}
      </span>
    </div>
  );
};

export default ReportsPage;
