import type { OrderMonitorOrder } from "@/types/order-monitor";

const now = Date.now();

const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();

export const orderMonitorMock: OrderMonitorOrder[] = [
  {
    id: "TOT-1048",
    orderNumber: "TOT-1048",
    customerName: "Marina Souza",
    createdAt: minutesAgo(4),
    status: "novo",
    total: 42.9,
    notes: "Sem cebola no sanduiche e suco com pouco gelo.",
    items: [
      { id: "1", name: "Combo Frango Crocante", quantity: 1 },
      { id: "2", name: "Batata rustica", quantity: 1 },
      { id: "3", name: "Suco de laranja 400ml", quantity: 1 },
    ],
  },
  {
    id: "TOT-1047",
    orderNumber: "TOT-1047",
    customerName: "Carlos Henrique",
    createdAt: minutesAgo(9),
    status: "em_preparo",
    total: 68.5,
    notes: "Adicionar guardanapos extras.",
    items: [
      { id: "1", name: "Pizza brotinho calabresa", quantity: 2 },
      { id: "2", name: "Refrigerante lata", quantity: 2 },
    ],
  },
  {
    id: "TOT-1046",
    orderNumber: "TOT-1046",
    customerName: "Priscila Almeida",
    createdAt: minutesAgo(14),
    status: "pronto",
    total: 31.8,
    notes: null,
    items: [
      { id: "1", name: "Wrap Caesar", quantity: 1 },
      { id: "2", name: "Cha gelado de pessego", quantity: 1 },
      { id: "3", name: "Cookie artesanal", quantity: 1 },
    ],
  },
  {
    id: "TOT-1045",
    orderNumber: "TOT-1045",
    customerName: "Joao Pedro",
    createdAt: minutesAgo(22),
    status: "finalizado",
    notes: "Cliente pediu para embalar separado.",
    total: 58.4,
    items: [
      { id: "1", name: "Bowl executivo", quantity: 2 },
      { id: "2", name: "Agua com gas", quantity: 2 },
    ],
  },
  {
    id: "TOT-1044",
    orderNumber: "TOT-1044",
    customerName: "Fernanda Costa",
    createdAt: minutesAgo(29),
    status: "em_preparo",
    total: 24.9,
    notes: null,
    items: [
      { id: "1", name: "Tapioca queijo minas", quantity: 1 },
      { id: "2", name: "Cafe latte", quantity: 1 },
    ],
  },
  {
    id: "TOT-1043",
    orderNumber: "TOT-1043",
    customerName: "Rafael Lima",
    createdAt: minutesAgo(37),
    status: "novo",
    total: 77.3,
    notes: "Molho barbecue em pote separado.",
    items: [
      { id: "1", name: "Costelinha barbecue", quantity: 1 },
      { id: "2", name: "Arroz cremoso", quantity: 1 },
      { id: "3", name: "Limonada da casa", quantity: 2 },
    ],
  },
];
