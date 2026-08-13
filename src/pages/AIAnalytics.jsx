import { useState, useEffect } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import anthropic from '../lib/anthropic';
const { analyzeData, fetchAllSystemData, calculateMetrics } = anthropic;
import Swal from 'sweetalert2';
import { saveAs } from 'file-saver';
import { utils as xlsxUtils, writeFileXLSX } from 'xlsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const translations = {
  en: {
    title: 'Complete AI Analytics',
    subtitle: 'Purchase | Discount | History | Reports | Category | Dashboard',
    exportBtn: 'Export Full Database',
    purchaseGroup: 'Purchase Group',
    totalPurchases: 'Total Purchases',
    totalSpent: 'Total Spent',
    suppliers: 'Suppliers',
    outstanding: 'Outstanding',
    historyOrders: 'History & Orders',
    totalOrders: 'Total Orders',
    totalRevenue: 'Total Revenue',
    todayRevenue: "Today's Revenue",
    todayOrders: "Today's Orders",
    inventoryMenu: 'Inventory & Menu',
    inventoryValue: 'Inventory Value',
    totalProducts: 'Total Products',
    lowStockAlert: 'Low Stock Alert',
    menuItems: 'Menu Items',
    discount: 'Discount',
    discountTypes: 'Discount Types',
    activeDiscounts: 'Active Discounts',
    categories: 'Categories',
    dataCategory: 'Data Category',
    allData: 'All Data',
    purchase: 'Purchase Group',
    history: 'History',
    reports: 'Reports',
    category: 'Category',
    dashboard: 'Dashboard',
    dateRange: 'Date Range',
    last7Days: 'Last 7 Days',
    last30Days: 'Last 30 Days',
    last90Days: 'Last 90 Days',
    thisYear: 'This Year',
    dailySales: 'Daily Sales',
    byCategory: 'By Category',
    purchasesBySupplier: 'Purchases by Supplier',
    aiAnalysis: 'AI-Powered Analysis',
    aiAskAbout: 'Ask about ANY data - Purchase, Discount, History, Reports, Category, Dashboard',
    askPlaceholder: 'Ask AI about your complete database...',
    analyze: 'Analyze',
    analyzing: 'Analyzing...',
    aiReport: 'AI Analysis Report'
  },
  my: {
    title: 'AI ခွဲခြမ်းစိတ်ဖြာမှု',
    subtitle: 'အဝယ် | လျှော့ဈေး | သမိုင်း | အစီရင်ခံစာ | ကဏ္ဍ | ဒက်ရှ်ဘုတ်',
    exportBtn: 'ဒေတာအားလုံး ထုတ်မယ်',
    purchaseGroup: 'အဝယ်ပိုင်း',
    totalPurchases: 'အဝယ်အရေအတွက်',
    totalSpent: 'စုစုပေါင်း သုံးစွဲ',
    suppliers: 'ပေးသွင်းသူ',
    outstanding: 'ကျန်ငွေ',
    historyOrders: 'အော်ဒါ သမိုင်း',
    totalOrders: 'အော်ဒါ စုစုပေါင်း',
    totalRevenue: 'စုစုပေါင်း ဝင်ငွေ',
    todayRevenue: 'ယနေ့ ဝင်ငွေ',
    todayOrders: 'ယနေ့ အော်ဒါ',
    inventoryMenu: 'ပစ္စည်းလက်ကျန် & မီနူး',
    inventoryValue: 'ပစ္စည်းတန်ဖိုး',
    totalProducts: 'ပစ္စည်းအရေအတွက်',
    lowStockAlert: 'ပစ္စည်းလက်ကျန် နည်းအသိပေး',
    menuItems: 'မီနူး အရေအတွက်',
    discount: 'လျှော့ဈေး',
    discountTypes: 'လျှော့ဈေး အမျိုးအစား',
    activeDiscounts: 'တက်ကြွ လျှော့ဈေးများ',
    categories: 'ကဏ္ဍများ',
    dataCategory: 'ဒေတာ ကဏ္ဍ',
    allData: 'ဒေတာ အားလုံး',
    purchase: 'အဝယ်ပိုင်း',
    history: 'သမိုင်း',
    reports: 'အစီရင်ခံစာ',
    category: 'ကဏ္ဍ',
    dashboard: 'ဒက်ရှ်ဘုတ်',
    dateRange: 'ရက်ပိုင်း',
    last7Days: 'နောက် ၇ ရက်',
    last30Days: 'နောက် ၃၀ ရက်',
    last90Days: 'နောက် ၉၀ ရက်',
    thisYear: 'ယခုနှစ်',
    dailySales: 'နေ့စဉ် အရောင်း',
    byCategory: 'ကဏ္ဍအလိုက်',
    purchasesBySupplier: 'ပေးသွင်းသူအလိုက် အဝယ်',
    aiAnalysis: 'AI ခွဲခြမ်းစိတ်ဖြာမှု',
    aiAskAbout: 'မည်သည့်ဒေတာကိုမဆို မေးမြန်းနိုင်ပါ - အဝယ်၊ လျှော့ဈေး၊ သမိုင်း၊ အစီရင်ခံစာ၊ ကဏ္ဍ၊ ဒက်ရှ်ဘုတ်',
    askPlaceholder: 'သင့်ဒေတာအားလုံးကို AI မှ မေးမြန်းပါ...',
    analyze: 'ခွဲခြမ်းစိတ်ဖြာ',
    analyzing: 'ခွဲခြမ်းစိတ်ဖြာနေသည်...',
    aiReport: 'AI ခွဲခြမ်းစိတ်ဖြာမှု အစီရင်ခံစာ'
  }
};

export default function AIAnalytics() {
  const [language, setLanguage] = useState(() => localStorage.getItem('ai_analytics_language') || 'en');
  const t = translations[language];

  const [analyticsData, setAnalyticsData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [dateRange, setDateRange] = useState('7days');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);

  // Fetch real data from ALL tables
  const loadRealData = async () => {
    setLoading(true);
    try {
      const allData = await fetchAllSystemData();
      const calculatedMetrics = calculateMetrics(allData);

      // Build sales data from real orders
      const salesByDay = {};
      allData.orders?.forEach(order => {
        if (order.status === 'completed') {
          const date = new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'short' });
          salesByDay[date] = (salesByDay[date] || 0) + (parseFloat(order.total) || 0);
        }
      });

      // Build category data from menu
      const categorySales = {};
      allData.menu?.forEach(item => {
        const cat = item.category_id || item.category || 'Other';
        categorySales[cat] = (categorySales[cat] || 0) + (parseFloat(item.price) || 0);
      });

      // Build purchase trend
      const purchaseBySupplier = {};
      allData.purchases?.forEach(p => {
        const supplierName = p.supplier_id || 'Unknown';
        purchaseBySupplier[supplierName] = (purchaseBySupplier[supplierName] || 0) + (parseFloat(p.total_amount) || 0);
      });

      setAnalyticsData({
        salesData: {
          labels: Object.keys(salesByDay),
          datasets: [{
            label: 'Daily Sales',
            data: Object.values(salesByDay),
            backgroundColor: 'rgba(99, 102, 241, 0.5)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 2
          }]
        },
        categoryData: {
          labels: Object.keys(categorySales),
          datasets: [{
            label: 'Revenue by Category',
            data: Object.values(categorySales),
            backgroundColor: [
              'rgba(99, 102, 241, 0.7)',
              'rgba(168, 85, 247, 0.7)',
              'rgba(236, 72, 153, 0.7)',
              'rgba(251, 146, 60, 0.7)',
              'rgba(34, 197, 94, 0.7)',
              'rgba(239, 68, 68, 0.7)'
            ]
          }]
        },
        purchaseData: {
          labels: Object.keys(purchaseBySupplier),
          datasets: [{
            label: 'Purchases by Supplier',
            data: Object.values(purchaseBySupplier),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 2
          }]
        },
        trendData: {
          labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          datasets: [{
            label: 'Sales Trend',
            data: [
              calculatedMetrics.history.total_revenue * 0.2,
              calculatedMetrics.history.total_revenue * 0.25,
              calculatedMetrics.history.total_revenue * 0.23,
              calculatedMetrics.history.total_revenue * 0.32
            ],
            borderColor: 'rgba(34, 197, 94, 1)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.4
          }]
        },
        allData,
        metrics: calculatedMetrics
      });

      setMetrics(calculatedMetrics);

    } catch (error) {
      console.error('Error loading data:', error);
      Swal.fire('Error', 'Failed to load analytics data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRealData();
  }, []);

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'my' : 'en';
    setLanguage(newLang);
    localStorage.setItem('ai_analytics_language', newLang);
  };

  const handleAIAnalysis = async () => {
    if (!aiQuestion.trim()) return;

    setIsAnalyzing(true);
    const result = await analyzeData({
      question: aiQuestion,
      dataType: selectedCategory
    });

    if (result.success) {
      setAiAnalysis(result.analysis);
    } else {
      Swal.fire('Error', result.error, 'error');
    }
    setIsAnalyzing(false);
  };

  const exportReport = () => {
    if (!analyticsData?.allData) return;

    const wb = xlsxUtils.book_new();

    // Purchase Group
    const purchasesWs = xlsxUtils.json_to_sheet(analyticsData.allData.purchases || []);
    xlsxUtils.book_append_sheet(wb, purchasesWs, 'Purchases');
    const purchaseItemsWs = xlsxUtils.json_to_sheet(analyticsData.allData.purchase_items || []);
    xlsxUtils.book_append_sheet(wb, purchaseItemsWs, 'Purchase Items');
    const suppliersWs = xlsxUtils.json_to_sheet(analyticsData.allData.suppliers || []);
    xlsxUtils.book_append_sheet(wb, suppliersWs, 'Suppliers');
    const outstandingWs = xlsxUtils.json_to_sheet(analyticsData.allData.supplier_outstanding || []);
    xlsxUtils.book_append_sheet(wb, outstandingWs, 'Supplier Outstanding');

    // Discount
    const discountWs = xlsxUtils.json_to_sheet(analyticsData.allData.discount_types || []);
    xlsxUtils.book_append_sheet(wb, discountWs, 'Discount Types');

    // History
    const ordersWs = xlsxUtils.json_to_sheet(analyticsData.allData.orders || []);
    xlsxUtils.book_append_sheet(wb, ordersWs, 'Orders');
    const orderItemsWs = xlsxUtils.json_to_sheet(analyticsData.allData.order_items || []);
    xlsxUtils.book_append_sheet(wb, orderItemsWs, 'Order Items');
    const historyWs = xlsxUtils.json_to_sheet(analyticsData.allData.history || []);
    xlsxUtils.book_append_sheet(wb, historyWs, 'History');
    const internalWs = xlsxUtils.json_to_sheet(analyticsData.allData.internal_consumption || []);
    xlsxUtils.book_append_sheet(wb, internalWs, 'Internal Consumption');

    // Inventory & Menu
    const inventoryWs = xlsxUtils.json_to_sheet(analyticsData.allData.inventory || []);
    xlsxUtils.book_append_sheet(wb, inventoryWs, 'Inventory');
    const menuWs = xlsxUtils.json_to_sheet(analyticsData.allData.menu || []);
    xlsxUtils.book_append_sheet(wb, menuWs, 'Menu');
    const categoriesWs = xlsxUtils.json_to_sheet(analyticsData.allData.categories || []);
    xlsxUtils.book_append_sheet(wb, categoriesWs, 'Categories');

    // Payments
    const paymentsWs = xlsxUtils.json_to_sheet(analyticsData.allData.payments || []);
    xlsxUtils.book_append_sheet(wb, paymentsWs, 'Payments');

    // Summary
    const summaryData = [
      { Category: 'Purchase', Metric: 'Total Purchases', Value: metrics?.purchase?.total_purchases || 0 },
      { Category: 'Purchase', Metric: 'Total Spent', Value: metrics?.purchase?.total_spent || 0 },
      { Category: 'Suppliers', Metric: 'Total Suppliers', Value: metrics?.suppliers?.total_suppliers || 0 },
      { Category: 'Discount', Metric: 'Discount Types', Value: metrics?.discount?.total_types || 0 },
      { Category: 'History', Metric: 'Total Orders', Value: metrics?.history?.total_orders || 0 },
      { Category: 'History', Metric: 'Total Revenue', Value: metrics?.history?.total_revenue || 0 },
      { Category: 'History', Metric: 'Today Revenue', Value: metrics?.history?.today_revenue || 0 },
      { Category: 'Inventory', Metric: 'Total Items', Value: metrics?.inventory?.total_items || 0 },
      { Category: 'Inventory', Metric: 'Inventory Value', Value: metrics?.inventory?.total_value || 0 },
      { Category: 'Inventory', Metric: 'Low Stock Items', Value: metrics?.inventory?.low_stock || 0 },
      { Category: 'Menu', Metric: 'Menu Items', Value: metrics?.menu?.total_items || 0 },
      { Category: 'Menu', Metric: 'Categories', Value: metrics?.menu?.total_categories || 0 }
    ];
    const summaryWs = xlsxUtils.json_to_sheet(summaryData);
    xlsxUtils.book_append_sheet(wb, summaryWs, 'Summary');

    writeFileXLSX(wb, `Complete_Database_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    Swal.fire('Success', 'Complete database report exported!', 'success');
  };

  const quickQuestions = {
    en: [
      'Show me pending purchases',
      'Which suppliers do I have?',
      'What is my outstanding supplier payments?',
      'What discounts are configured?',
      'Analyze my order history',
      'What are my sales trends?',
      'Show me today\'s revenue',
      'What is my total inventory value?',
      'Which items are low in stock?',
      'Give me a business summary'
    ],
    my: [
      'Pending အဝယ်များ ပြပါ',
      'ပေးသွင်းသူများ ကြည့်ရန်',
      'ကျန်နေသေးသော ပေးသွင်းသူငွေများ',
      'လျှော့ဈေးများကို ကြည့်ရန်',
      'အော်ဒါ သမိုင်း ခွဲခြမ်းစိတ်ဖြာ',
      'အရောင်းအခြေအနေ',
      'ယနေ့ ဝင်ငွေ ကြည့်ရန်',
      'စုစုပေါင်း ပစ္စည်းလက်ကျန်တန်ဖိုး',
      'ပစ္စည်းလက်ကျန် နည်းနေသော ပစ္စည်းများ',
      'လုပ်ငန်းအကျဉ်းချုပ် ပေးပါ'
    ]
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100 dark:bg-slate-900">
        <div className="text-slate-600 dark:text-slate-300">Loading complete database...</div>
      </div>
    );
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {t.title}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t.subtitle}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleLanguage}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
              >
                {language === 'en' ? '🇲🇲 Myanmar' : '🇬🇧 English'}
              </button>
              <button
                onClick={exportReport}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                {t.exportBtn}
              </button>
            </div>
          </div>
        </div>

        {/* Metrics Cards - Purchase Group */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.purchaseGroup}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalPurchases}</p>
              <p className="text-2xl font-bold text-indigo-600">{metrics?.purchase?.total_purchases || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalSpent}</p>
              <p className="text-2xl font-bold text-indigo-600">{metrics?.purchase?.total_spent?.toLocaleString()} MMK</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.suppliers}</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{metrics?.suppliers?.total_suppliers || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.outstanding}</p>
              <p className="text-2xl font-bold text-rose-600">{metrics?.suppliers?.outstanding_total?.toLocaleString()} MMK</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards - History & Orders */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.historyOrders}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalOrders}</p>
              <p className="text-2xl font-bold text-green-600">{metrics?.history?.total_orders || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalRevenue}</p>
              <p className="text-2xl font-bold text-green-600">{metrics?.history?.total_revenue?.toLocaleString()} MMK</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.todayRevenue}</p>
              <p className="text-2xl font-bold text-emerald-600">{metrics?.history?.today_revenue?.toLocaleString()} MMK</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.todayOrders}</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{metrics?.history?.today_orders || 0}</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards - Inventory & Menu */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.inventoryMenu}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.inventoryValue}</p>
              <p className="text-2xl font-bold text-blue-600">{metrics?.inventory?.total_value?.toLocaleString()} MMK</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalProducts}</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{metrics?.inventory?.total_items || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.lowStockAlert}</p>
              <p className="text-2xl font-bold text-rose-600">{metrics?.inventory?.low_stock || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.menuItems}</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{metrics?.menu?.total_items || 0}</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards - Discount */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">{t.discount}</h2>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.discountTypes}</p>
              <p className="text-2xl font-bold text-purple-600">{metrics?.discount?.total_types || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.activeDiscounts}</p>
              <p className="text-2xl font-bold text-purple-600">{metrics?.discount?.active_discounts || 0}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t.dataCategory}
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
            >
              <option value="all">{t.allData}</option>
              <option value="purchase">{t.purchase}</option>
              <option value="discount">{t.discount}</option>
              <option value="history">{t.history}</option>
              <option value="reports">{t.reports}</option>
              <option value="category">{t.category}</option>
              <option value="dashboard">{t.dashboard}</option>
            </select>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t.dateRange}
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
            >
              <option value="7days">{t.last7Days}</option>
              <option value="30days">{t.last30Days}</option>
              <option value="90days">{t.last90Days}</option>
              <option value="year">{t.thisYear}</option>
            </select>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Sales Bar Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {t.dailySales}
            </h3>
            <div className="h-48">
              <Bar data={analyticsData?.salesData} options={chartOptions} />
            </div>
          </div>

          {/* Category Pie Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {t.byCategory}
            </h3>
            <div className="h-48">
              <Pie data={analyticsData?.categoryData} options={chartOptions} />
            </div>
          </div>

          {/* Purchase Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {t.purchasesBySupplier}
            </h3>
            <div className="h-48">
              <Bar data={analyticsData?.purchaseData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* AI Analysis Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            {t.aiAnalysis}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t.aiAskAbout}
          </p>

          {/* Quick Questions */}
          <div className="flex flex-wrap gap-2 mb-4">
            {quickQuestions[language].map((question, index) => (
              <button
                key={index}
                onClick={() => setAiQuestion(question)}
                className="px-3 py-1.5 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex space-x-3 mb-4">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder={t.askPlaceholder}
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
              onKeyPress={(e) => e.key === 'Enter' && handleAIAnalysis()}
            />
            <button
              onClick={handleAIAnalysis}
              disabled={isAnalyzing || !aiQuestion.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-xl font-medium transition-colors disabled:cursor-not-allowed"
            >
              {isAnalyzing ? t.analyzing : t.analyze}
            </button>
          </div>

          {/* AI Response */}
          {aiAnalysis && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-700">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-3">
                    {t.aiReport}
                  </h4>
                  <div
                    className="text-slate-700 dark:text-slate-300 max-h-96 overflow-y-auto prose prose-sm dark:prose-invert"
                    dangerouslySetInnerHTML={{
                      __html: aiAnalysis
                        .split('\n')
                        .map(line => {
                          // Bold
                          line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                          // Headers
                          if (line.startsWith('## ')) {
                            return `<h3 class="font-bold text-lg mt-4 mb-2 text-indigo-700 dark:text-indigo-400">${line.replace(/^## /, '')}</h3>`;
                          }
                          if (line.startsWith('### ')) {
                            return `<h4 class="font-bold mt-3 mb-1">${line.replace(/^### /, '')}</h4>`;
                          }
                          // Bullet points
                          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
                            return `<div class="ml-4 flex items-start"><span class="mr-2">•</span><span>${line.trim().replace(/^[•\-]\s*/, '')}</span></div>`;
                          }
                          // Numbered lists
                          if (/^\d+\./.test(line.trim())) {
                            return `<div class="ml-4 flex items-start"><span class="mr-2 font-semibold">${line.match(/^\d+\./)[0]}</span><span>${line.replace(/^\d+\.\s*/, '')}</span></div>`;
                          }
                          // Empty lines
                          if (line.trim() === '') {
                            return '<br/>';
                          }
                          return `<p class="my-1">${line}</p>`;
                        })
                        .join('')
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
