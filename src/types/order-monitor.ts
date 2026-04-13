export type OrderMonitorStatus = "novo" | "em_preparo" | "pronto" | "finalizado" | "cancelado";

export type OrderAutomationStatus = "PENDING" | "PROCESSING" | "SYNCED" | "ERROR" | null;

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
  saibwebStatus?: OrderAutomationStatus;
  saibwebError?: string | null;
  isLive?: boolean;
};
