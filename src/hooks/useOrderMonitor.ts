import { useCallback, useEffect, useMemo, useState } from "react";

import { orderMonitorMock } from "@/data/orderMonitorMock";
import { fetchOrderMonitorOrders, getDayRange, type OrderMonitorDateRange } from "@/services/orderMonitor";
import type { OrderMonitorOrder, OrderMonitorStatus } from "@/types/order-monitor";

type StatusFilter = "todos" | OrderMonitorStatus;
type SortOption = "recentes" | "antigos" | "cliente";
export type DatePreset = "today" | "yesterday" | "last7" | "custom";

const LOADING_DELAY_MS = 650;

function getTodayDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getYesterdayDate() {
  const date = getTodayDate();
  date.setDate(date.getDate() - 1);
  return date;
}

function getLast7Range(): OrderMonitorDateRange {
  const end = getTodayDate();
  end.setDate(end.getDate() + 1);

  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

function resolveDateRange(preset: DatePreset, customDate: Date): OrderMonitorDateRange {
  if (preset === "today") return getDayRange(getTodayDate());
  if (preset === "yesterday") return getDayRange(getYesterdayDate());
  if (preset === "last7") return getLast7Range();
  return getDayRange(customDate);
}

function sortOrders(orders: OrderMonitorOrder[], sortBy: SortOption) {
  const nextOrders = [...orders];

  if (sortBy === "cliente") {
    return nextOrders.sort((a, b) => a.customerName.localeCompare(b.customerName, "pt-BR"));
  }

  return nextOrders.sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortBy === "recentes" ? diff : -diff;
  });
}

export function useOrderMonitor() {
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customDate, setCustomDate] = useState(() => getTodayDate());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sortBy, setSortBy] = useState<SortOption>("recentes");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sourceOrders, setSourceOrders] = useState<OrderMonitorOrder[]>([]);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const dateRange = useMemo(() => resolveDateRange(datePreset, customDate), [datePreset, customDate]);

  const refreshOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [liveOrders] = await Promise.all([
        fetchOrderMonitorOrders(dateRange),
        new Promise((resolve) => window.setTimeout(resolve, LOADING_DELAY_MS)),
      ]);

      setSourceOrders(liveOrders);
      setIsUsingMock(false);
    } catch (error) {
      console.error("Falha ao carregar painel de pedidos em tempo real.", error);
      await new Promise((resolve) => window.setTimeout(resolve, LOADING_DELAY_MS));
      setSourceOrders(orderMonitorMock);
      setIsUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const nextOrders = sourceOrders.filter((order) => {
      const matchesSearch =
        !normalizedSearch ||
        order.customerName.toLowerCase().includes(normalizedSearch) ||
        order.id.toLowerCase().includes(normalizedSearch) ||
        String(order.orderNumber ?? "").toLowerCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === "todos" || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return sortOrders(nextOrders, sortBy);
  }, [search, sortBy, statusFilter, sourceOrders]);

  const selectedOrder =
    filteredOrders.find((order) => order.id === selectedOrderId) ??
    sourceOrders.find((order) => order.id === selectedOrderId) ??
    null;

  const recentOrders = useMemo(() => sortOrders(sourceOrders, "recentes").slice(0, 3), [sourceOrders]);

  const stats = useMemo(() => {
    const totalOrders = sourceOrders.length;
    const newOrders = sourceOrders.filter((order) => order.status === "novo").length;
    const inProgressOrders = sourceOrders.filter((order) => order.status === "em_preparo").length;
    const revenue = sourceOrders.reduce((sum, order) => sum + order.total, 0);

    return { totalOrders, newOrders, inProgressOrders, revenue };
  }, [sourceOrders]);

  return {
    loading,
    orders: filteredOrders,
    recentOrders,
    selectedOrder,
    selectedOrderId,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    stats,
    isUsingMock,
    datePreset,
    setDatePreset,
    customDate,
    setCustomDate,
    dateRange,
    refreshOrders,
    openOrderDetails: (orderId: string) => setSelectedOrderId(orderId),
    closeOrderDetails: () => setSelectedOrderId(null),
  };
}
