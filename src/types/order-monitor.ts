export type OrderMonitorStatus = "novo" | "em_preparo" | "pronto" | "finalizado" | "cancelado";

// Os únicos valores que `orders.erp_status` recebe hoje: o checkout nasce
// PENDING e automation/cigam/process-pending-orders.ts grava DONE ou ERROR.
// Não há estado intermediário — o processador não marca PROCESSING.
export type OrderAutomationStatus = "PENDING" | "DONE" | "ERROR" | null;

export type OrderMonitorItem = {
  id: string;
  name: string;
  quantity: number;
  total?: number | null;
  weight?: number | null;
};

export type OrderMonitorOrder = {
  id: string;
  orderNumber?: string | null;
  customerName: string;
  createdAt: string;
  status: OrderMonitorStatus;
  total: number;
  items: OrderMonitorItem[];
  notes?: string | null;
  totalWeightKg?: number | null;
  pricingTable?: "varejo" | "atacado" | null;
  erpStatus?: OrderAutomationStatus;
  erpError?: string | null;
  erpExternalId?: string | null;
  erpNotaFiscal?: string | null;
  isLive?: boolean;
};
