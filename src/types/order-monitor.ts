export type OrderMonitorStatus = "novo" | "em_preparo" | "pronto" | "finalizado" | "cancelado";

export type OrderAutomationStatus = "PENDING" | "PROCESSING" | "SYNCED" | "ERROR" | null;

export type OrderMonitorItem = {
  id: string;
  name: string;
  quantity: number;
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
  saibwebStatus?: OrderAutomationStatus;
  saibwebError?: string | null;
  isLive?: boolean;
};
