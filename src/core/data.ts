/**
 * Fictional data for "Kettle Hill Roasters", an invented coffee roastery that sells
 * to cafés. Everything is generated from a seeded random generator, so the same
 * data appears on every run. Names, emails (example.com) and cities are invented.
 */

export interface Product {
  sku: string;
  name: string;
  origin: string;
  process: "Washed" | "Natural" | "Honey" | "Blend";
  pricePerKg: number;
  stockKg: number;
  reorderKg: number;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  city: string;
  creditDays: number;
}

export interface OrderLine {
  sku: string;
  kg: number;
}

export interface Order {
  id: string;
  customerId: string;
  date: string;
  lines: OrderLine[];
  total: number;
  status: "open" | "shipped" | "delivered" | "cancelled";
}

export interface Invoice {
  id: string;
  orderId: string;
  customerId: string;
  issued: string;
  due: string;
  amount: number;
  paid: boolean;
}

export interface ErpData {
  products: Product[];
  customers: Customer[];
  orders: Order[];
  invoices: Invoice[];
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoDaysAgo(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRODUCTS: Omit<Product, "stockKg" | "reorderKg">[] = [
  { sku: "ETH-GUJ-NAT", name: "Guji Natural", origin: "Ethiopia", process: "Natural", pricePerKg: 21.5 },
  { sku: "ETH-YRG-NAT", name: "Yirgacheffe Natural", origin: "Ethiopia", process: "Natural", pricePerKg: 23 },
  { sku: "ETH-SID-WSH", name: "Sidama Washed", origin: "Ethiopia", process: "Washed", pricePerKg: 19.8 },
  { sku: "COL-HUI-WSH", name: "Huila Washed", origin: "Colombia", process: "Washed", pricePerKg: 17.9 },
  { sku: "BRA-CER-HON", name: "Cerrado Honey", origin: "Brazil", process: "Honey", pricePerKg: 15.4 },
  { sku: "KEN-NYE-WSH", name: "Nyeri AA", origin: "Kenya", process: "Washed", pricePerKg: 24.6 },
  { sku: "GUA-ANT-WSH", name: "Antigua Washed", origin: "Guatemala", process: "Washed", pricePerKg: 18.7 },
  { sku: "CRI-TAR-HON", name: "Tarrazú Honey", origin: "Costa Rica", process: "Honey", pricePerKg: 20.9 },
  { sku: "IDN-MAN-WSH", name: "Mandheling", origin: "Indonesia", process: "Washed", pricePerKg: 16.8 },
  { sku: "BLD-HSE-ESP", name: "House Espresso Blend", origin: "Blend", process: "Blend", pricePerKg: 14.2 },
];

const CAFE_WORDS = ["Corner", "Lantern", "Juniper", "Copper", "Foxglove", "Marlow", "Saffron", "Driftwood", "Alder", "Harbor", "Brass", "Willow", "Compass", "Pebble", "Larkspur", "Ironbark", "Maple", "Sparrow", "Quill", "Tidewater", "Hollow", "Cinder", "Fernhill", "Birch"];
const CAFE_KINDS = ["Café", "Coffee House", "Espresso Bar", "Roastery & Kitchen"];
const FIRST = ["Nora", "Liam", "Ava", "Ethan", "Maya", "Owen", "Zoe", "Caleb", "Ivy", "Julian", "Hazel", "Miles"];
const LAST = ["Holloway", "Pearce", "Whitfield", "Castillo", "Bennett", "Okafor", "Lindqvist", "Moreau", "Sutton", "Rahman", "Dalton", "Ferris"];
const CITIES = ["Riverton", "Lakeport", "Eastvale", "Northfield", "Springdale", "Clearwater Bay"];

export function generateData(today = new Date()): ErpData {
  const r = rng(20261004);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)] as T;

  const products: Product[] = PRODUCTS.map((p) => {
    const reorderKg = 40 + Math.round(r() * 60);
    return { ...p, reorderKg, stockKg: Math.round(reorderKg * (0.35 + r() * 2.1)) };
  });

  const customers: Customer[] = CAFE_WORDS.map((w, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    return {
      id: `C-${String(100 + i)}`,
      name: `${w} ${pick(CAFE_KINDS)}`,
      contact: `${first} ${last}`,
      email: `${first}.${last}@example.com`.toLowerCase(),
      city: pick(CITIES),
      creditDays: pick([15, 30, 30, 45]),
    };
  });

  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  let orderSeq = 1000;
  let invoiceSeq = 5000;
  for (let day = 120; day >= 0; day--) {
    const n = Math.floor(r() * 3.4);
    for (let k = 0; k < n; k++) {
      const customer = pick(customers);
      const lineCount = 1 + Math.floor(r() * 3);
      const lines: OrderLine[] = Array.from({ length: lineCount }, () => ({ sku: pick(products).sku, kg: 5 * (1 + Math.floor(r() * 8)) }));
      const total = Math.round(lines.reduce((sum, l) => sum + l.kg * (products.find((p) => p.sku === l.sku)?.pricePerKg ?? 0), 0) * 100) / 100;
      const status: Order["status"] = day < 2 ? "open" : day < 5 ? "shipped" : r() < 0.04 ? "cancelled" : "delivered";
      const id = `SO-${orderSeq++}`;
      orders.push({ id, customerId: customer.id, date: isoDaysAgo(day, today), lines, total, status });
      if (status === "delivered" || status === "shipped") {
        const issued = isoDaysAgo(Math.max(day - 1, 0), today);
        const due = isoDaysAgo(Math.max(day - 1 - customer.creditDays, -customer.creditDays), today);
        const overdueDays = Math.max(0, day - 1 - customer.creditDays);
        const paid = overdueDays === 0 ? r() < 0.4 : r() < (overdueDays > 60 ? 0.9 : 0.72);
        invoices.push({ id: `INV-${invoiceSeq++}`, orderId: id, customerId: customer.id, issued, due, amount: total, paid });
      }
    }
  }
  return { products, customers, orders, invoices };
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(to).setHours(12, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}
