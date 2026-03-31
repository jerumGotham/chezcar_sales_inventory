export const customers = [
  {
    id: "CUST-1001",
    name: "Mark Reyes",
    mobile: "0917-111-2233",
    city: "Quezon City",
    status: "Active",
    lastTransaction: "2026-03-29",
  },
  {
    id: "CUST-1002",
    name: "Paolo Santos",
    mobile: "0918-210-4412",
    city: "Makati",
    status: "Active",
    lastTransaction: "2026-03-30",
  },
  {
    id: "CUST-1003",
    name: "Gina Lopez",
    mobile: "0922-774-1932",
    city: "Pasig",
    status: "VIP",
    lastTransaction: "2026-03-27",
  },
];

export const jobOrders = [
  {
    joNo: "JO-901",
    customer: "Paolo Santos",
    service: "Head Unit Installation",
    technician: "Assigned Later",
    status: "In Progress",
    amount: "₱1,500",
  },
  {
    joNo: "JO-902",
    customer: "Mark Reyes",
    service: "Tint Installation",
    technician: "Assigned Later",
    status: "Pending",
    amount: "₱3,800",
  },
];

export const transfers = [
  {
    transferNo: "TR-100",
    from: "QC Main",
    to: "Makati",
    item: "Dash Cam 1080p",
    qty: 5,
    status: "Pending Approval",
  },
  {
    transferNo: "TR-101",
    from: "Pasig",
    to: "QC Main",
    item: "Rain Visor Set",
    qty: 8,
    status: "In Transit",
  },
];

export const dashboardStats = [
  {
    label: "Today's Sales",
    value: "₱58,420",
    hint: "+12.4% vs yesterday",
    tone: "success",
    featured: true,
  },
  {
    label: "This Month Sales",
    value: "₱1,284,300",
    hint: "+8.1% vs last month",
    tone: "info",
  },
  {
    label: "Pending Orders",
    value: "14",
    hint: "5 with downpayment",
    tone: "warning",
  },
  {
    label: "Low Stock Items",
    value: "9",
    hint: "Needs replenishment",
    tone: "danger",
  },
];

export const lowStock = [
  {
    item: "3M Tint Medium Black",
    branch: "QC Main",
    qty: 2,
    reorderLevel: 5,
  },
  {
    item: "Dash Cam 1080p",
    branch: "Makati",
    qty: 1,
    reorderLevel: 3,
  },
  {
    item: "Car Mat Universal",
    branch: "Pasig",
    qty: 3,
    reorderLevel: 8,
  },
];

export const orders = [
  {
    orderNo: "ORD-3001",
    customer: "Mark Reyes",
    item: "Toyota Rush Seat Cover",
    status: "Waiting Stock",
    downpayment: "₱2,000",
    releaseDate: "2026-04-05",
  },
  {
    orderNo: "ORD-3002",
    customer: "Gina Lopez",
    item: "Roof Rack",
    status: "Ready for Release",
    downpayment: "₱3,000",
    releaseDate: "2026-04-01",
  },
];

export const notifications = [
  {
    title: "Low stock alert",
    description: "3M Tint Medium Black is below reorder level in QC Main.",
    time: "10 mins ago",
  },
  {
    title: "Order ready for release",
    description: "ORD-3002 can now be released to customer.",
    time: "30 mins ago",
  },
  {
    title: "Transfer awaiting approval",
    description: "TR-100 needs branch manager approval.",
    time: "1 hour ago",
  },
];

export const salesTrend = [
  { day: "Mon", sales: 42200 },
  { day: "Tue", sales: 51800 },
  { day: "Wed", sales: 47650 },
  { day: "Thu", sales: 60300 },
  { day: "Fri", sales: 58420 },
  { day: "Sat", sales: 68950 },
  { day: "Sun", sales: 55780 },
];

export const branchPerformance = [
  {
    branch: "QC Main",
    sales: 520000,
    transactions: 142,
    share: 41,
  },
  {
    branch: "Makati",
    sales: 412000,
    transactions: 108,
    share: 32,
  },
  {
    branch: "Pasig",
    sales: 352300,
    transactions: 91,
    share: 27,
  },
];

export const topSellingProducts = [
  {
    name: "3M Tint Medium Black",
    unitsSold: 42,
    revenue: 126000,
  },
  {
    name: "Toyota Rush Seat Cover",
    unitsSold: 28,
    revenue: 112000,
  },
  {
    name: "Android Head Unit",
    unitsSold: 15,
    revenue: 193500,
  },
  {
    name: "Roof Rack",
    unitsSold: 12,
    revenue: 72000,
  },
];

export const products = [
  {
    sku: "ACC-001",
    name: "Leather Seat Cover",
    category: "Interior",
    price: "₱4,500",
    stock: 12,
    branch: "QC Main",
  },
  {
    sku: "ACC-002",
    name: "Android Head Unit",
    category: "Electronics",
    price: "₱12,900",
    stock: 4,
    branch: "QC Main",
  },
  {
    sku: "ACC-003",
    name: "Rain Visor Set",
    category: "Exterior",
    price: "₱1,250",
    stock: 20,
    branch: "Pasig",
  },
];
