import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, type ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import * as api from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface DailyRevenue {
  date: string;
  checkinRevenue: number;
  paymentRevenue: number;
  total: number;
  checkinCount: number;
  paymentCount: number;
}

interface RevenueData {
  todayRevenue: number;
  thisMonthRevenue: number;
  thisYearRevenue: number;
  dailyBreakdown: DailyRevenue[];
  categoryBreakdown: { category: string; memberCount: number; monthlyRevenue: number }[];
  month: number;
  year: number;
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type FilterKey = 'all' | 'checkin' | 'payment';

const monthNav = (m: number, y: number, dir: -1 | 1): [number, number] => {
  let nm = m + dir;
  let ny = y;
  if (nm < 1) { nm = 12; ny--; }
  if (nm > 12) { nm = 1; ny++; }
  return [nm, ny];
};

export default function RevenueView() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showYearInput, setShowYearInput] = useState(false);
  const [yearInput, setYearInput] = useState(String(year));
  const [breakdownModal, setBreakdownModal] = useState<'checkin' | 'payment' | null>(null);
  const [planModal, setPlanModal] = useState<string | null>(null);
  const [planMembers, setPlanMembers] = useState<{ name: string; member_id: string; plan: string; status: string; monthly_revenue?: number }[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<{ type: 'checkin' | 'payment'; date: string } | null>(null);
  const [detailRecords, setDetailRecords] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const chartRef = useRef<ChartJS<'line'>>(null);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.fetchRevenue(year, month);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load revenue data.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  useEffect(() => {
    if (!planModal) { setPlanMembers([]); return; }
    setPlanLoading(true);
    api.fetchMembers('', '', planModal, year, month).then(setPlanMembers).catch(() => setPlanMembers([])).finally(() => setPlanLoading(false));
  }, [planModal]);

  useEffect(() => {
    if (!detailModal) { setDetailRecords([]); return; }
    setDetailLoading(true);
    const fetcher = detailModal.type === 'checkin' ? api.fetchCheckIns(detailModal.date) : api.fetchPayments(detailModal.date);
    fetcher.then(setDetailRecords).catch(() => setDetailRecords([])).finally(() => setDetailLoading(false));
  }, [detailModal]);

  const currency = (n: number) => `₱${n.toLocaleString()}`;
  const planPeriod = (plan: string) => plan.includes('Daily') ? 'Daily' : plan.includes('Semi-Monthly') ? 'Semi-Monthly' : plan.includes('Monthly') ? 'Monthly' : '';
  const daysInMonth = new Date(year, month, 0).getDate();

  // Build daily chart data
  const chartData = useMemo(() => {
    const map: Record<string, DailyRevenue> = {};
    if (data) {
      for (const d of data.dailyBreakdown) map[d.date] = d;
    }
    const arr: { day: number; date: string; total: number; checkin: number; payment: number; checkinCount: number; paymentCount: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const r = map[key];
      arr.push({
        day: d,
        date: key,
        total: r?.total ?? 0,
        checkin: r?.checkinRevenue ?? 0,
        payment: r?.paymentRevenue ?? 0,
        checkinCount: r?.checkinCount ?? 0,
        paymentCount: r?.paymentCount ?? 0,
      });
    }
    return arr;
  }, [data, daysInMonth, month, year]);

  const activeKey: 'total' | 'checkin' | 'payment' = activeFilter === 'all' ? 'total' : activeFilter;

  // KPI computation
  const kpis = useMemo(() => {
    const active = chartData.filter(d => d.total > 0);
    const totalRev = active.reduce((s, d) => s + d.total, 0);
    const peak = active.reduce((b, d) => d.total > b.total ? d : b, { total: 0, day: 0, checkin: 0, payment: 0, checkinCount: 0, paymentCount: 0 });
    const mid = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, mid).reduce((s, d) => s + d.total, 0);
    const secondHalf = chartData.slice(mid).reduce((s, d) => s + d.total, 0);
    const growth = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    // Breakdown
    const ciRev = active.reduce((s, d) => s + d.checkin, 0);
    const pyRev = active.reduce((s, d) => s + d.payment, 0);
    // Actual counts from raw data
    const actualCICount = data ? data.dailyBreakdown.reduce((s, d) => s + d.checkinCount, 0) : 0;
    const actualPYCount = data ? data.dailyBreakdown.reduce((s, d) => s + d.paymentCount, 0) : 0;
    return { totalRev, peak, growth, activeDays: active.length, ciRev, pyRev, ciCount: actualCICount, pyCount: actualPYCount };
  }, [chartData, data]);

  const displayTotal = activeFilter === 'all' ? kpis.totalRev
    : activeFilter === 'checkin' ? chartData.reduce((s, d) => s + d.checkin, 0)
    : chartData.reduce((s, d) => s + d.payment, 0);

  const peakDay = kpis.peak.day;

  const chartConfig = useMemo(() => {
    const values = chartData.map(d => d[activeKey]);
    return {
      labels: chartData.map(d => d.day),
      datasets: [{
        label: activeFilter === 'all' ? 'Total Revenue' : activeFilter === 'checkin' ? 'Check-in Revenue' : 'Payment Revenue',
        data: values,
        fill: true,
        tension: 0.4,
        borderColor: '#ff5722',
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D } }) => {
          const grad = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
          grad.addColorStop(0, 'rgba(255, 87, 34, 0.4)');
          grad.addColorStop(1, 'rgba(255, 87, 34, 0)');
          return grad;
        },
        pointRadius: 0,
        pointHitRadius: 8,
        borderWidth: 2,
      }],
    };
  }, [chartData, activeFilter, activeKey]);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 4.5,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: ({ chart, tooltip }: Record<string, unknown>) => {
          const tooltipEl = document.getElementById('rev-custom-tooltip');
          if (!tooltipEl) return;
          const t = tooltip as { opacity: number; dataPoints?: { dataIndex: number }[]; caretX?: number; caretY?: number };
          if (t.opacity === 0 || !t.dataPoints?.length) {
            tooltipEl.style.opacity = '0';
            return;
          }
          const idx = t.dataPoints[0].dataIndex;
          const d = chartData[idx];
          if (!d || d.total === 0) { tooltipEl.style.opacity = '0'; return; }
          tooltipEl.innerHTML = `
            <div class="rev-tt-date">${monthNames[month - 1]} ${d.day}, ${year}</div>
            <div class="rev-tt-div"></div>
            <div class="rev-tt-row"><span>Revenue</span><span class="rev-tt-val">${currency(d.total)}</span></div>
            <div class="rev-tt-row"><span>Check-ins</span><span class="rev-tt-val">${currency(d.checkin)}</span></div>
            <div class="rev-tt-row"><span>Payments</span><span class="rev-tt-val">${currency(d.payment)}</span></div>
            <div class="rev-tt-row rev-tt-sm"><span>Transactions</span><span>${d.checkinCount + d.paymentCount}</span></div>
          `;
          const chartInstance = chart as unknown as { canvas: HTMLCanvasElement };
          const pos = chartInstance.canvas.getBoundingClientRect();
          tooltipEl.style.opacity = '1';
          tooltipEl.style.left = pos.left + (t.caretX ?? 0) + 'px';
          tooltipEl.style.top = pos.top + (t.caretY ?? 0) - 10 + 'px';
        },
      },
    },
    scales: {
      x: {
        border: { display: true, color: 'rgba(255,255,255,0.06)' },
        grid: { drawOnChartArea: false },
        ticks: { font: { family: 'Outfit, sans-serif' }, color: '#64748b', maxTicksLimit: 8 },
      },
      y: {
        display: false,
        border: { display: false },
        grid: { drawOnChartArea: false },
      },
    },
    onClick: (_: unknown, elements: { index?: number }[]) => {
      if (elements?.length) {
        const idx = elements[0].index;
        if (idx != null) {
          const d = chartData[idx];
          if (d && d.total > 0) setSelectedDay(d.day);
        }
      }
    },
  };

  const selectedDayData = selectedDay ? chartData[selectedDay - 1] : null;

  // Insight text
  const insight = useMemo(() => {
    if (kpis.activeDays === 0) return 'No revenue data yet for this month.';
    if (kpis.activeDays === 1 && peakDay > 0) {
      return `Revenue is concentrated on ${monthNames[month - 1]} ${peakDay}. Consider promoting memberships to increase recurring income.`;
    }
    if (kpis.growth > 5) return `Revenue grew ${kpis.growth.toFixed(1)}% in the second half. Strong momentum.`;
    if (kpis.growth < -5) return `Revenue declined ${Math.abs(kpis.growth).toFixed(1)}% in the second half. Consider re-engaging members.`;
    return `Steady revenue across ${kpis.activeDays} active day${kpis.activeDays !== 1 ? 's' : ''} this month.`;
  }, [kpis, month, peakDay]);

  return (
    <>
      <header className="header">
        <div className="header-title">
          <h2>Revenue Analytics</h2>
          <p>{monthNames[month - 1]} {year}</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={async () => { try { await api.exportRevenue(year, month); } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); } }}>
            Download Report
          </button>
        </div>
      </header>

      {error && <div className="toast error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading && (
        <div className="rev-loading">
          <div className="rev-loading-spinner" />
          <span>Loading revenue data...</span>
        </div>
      )}

      {!data && !loading && (
        <div className="rev-loading" style={{ padding: '5rem 2rem' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
          </svg>
          <span style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>No data available</span>
        </div>
      )}

      {data && (
        <div className="rev-dashboard">
          {/* ─── Main Chart Card ─── */}
          <div className="rev-card rev-card-chart">
            {/* Hero metric */}
            <div className="rev-hero">
              <div>
                <div className="rev-hero-label">{activeFilter === 'all' ? 'Total Revenue' : activeFilter === 'checkin' ? 'Check-in Revenue' : 'Payment Revenue'}</div>
                <div className="rev-hero-row">
                  <span className="rev-hero-amount">{currency(displayTotal)}</span>
                  <span className={`rev-hero-badge ${kpis.growth >= 0 ? 'up' : 'down'}`}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d={kpis.growth >= 0 ? 'M5 1l4 6H1z' : 'M5 9l4-6H1z'} /></svg>
                    {kpis.growth >= 0 ? '+' : ''}{kpis.growth.toFixed(1)}%
                  </span>
                </div>
                <div className="rev-hero-sub">vs previous month</div>
              </div>

              {/* Month nav */}
              <div className="rev-month-nav">
                <button className="rev-month-btn" onClick={() => { const [nm, ny] = monthNav(month, year, -1); setMonth(nm); setYear(ny); setSelectedDay(null); }}>&larr;</button>
                {showYearInput ? (
                  <input className="rev-year-input" type="number" value={yearInput}
                    onChange={e => setYearInput(e.target.value)}
                    onBlur={() => { const y = parseInt(yearInput); if (y > 2000 && y < 2100) setYear(y); setShowYearInput(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { const y = parseInt(yearInput); if (y > 2000 && y < 2100) setYear(y); setShowYearInput(false); } }}
                    autoFocus
                  />
                ) : (
                  <span className="rev-month-label" onClick={() => { setYearInput(String(year)); setShowYearInput(true); }}>
                    {monthNames[month - 1].slice(0, 3)} {year}
                  </span>
                )}
                <button className="rev-month-btn" onClick={() => { const [nm, ny] = monthNav(month, year, 1); setMonth(nm); setYear(ny); setSelectedDay(null); }}>&rarr;</button>
              </div>
            </div>

            {/* Pill filters */}
            <div className="rev-pills">
              {(['all', 'checkin', 'payment'] as FilterKey[]).map(k => (
                <button key={k} className={`rev-pill ${activeFilter === k ? 'active' : ''}`} onClick={() => setActiveFilter(k)}>
                  {k === 'all' ? 'Revenue' : k === 'checkin' ? 'Check-ins' : 'Payments'}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="rev-chart-area">
              <div id="rev-custom-tooltip" className="rev-tt" />
              <Line ref={chartRef} data={chartConfig} options={chartOptions} />
              {peakDay > 0 && (
                <div className="rev-peak-marker" style={{ left: `${(peakDay / daysInMonth) * 100}%` }}>
                  <span className="rev-peak-dot" />
                  <span className="rev-peak-label">Peak</span>
                </div>
              )}
            </div>

            {/* Day detail */}
            {selectedDayData && selectedDayData.total > 0 && (
              <div className="rev-day-flyout">
                <div className="rev-day-flyout-date">{monthNames[month - 1]} {selectedDay}, {year}</div>
                <div className="rev-day-flyout-grid">
                  <div className="rev-day-stat">
                    <span className="rev-day-stat-label">Daily Revenue</span>
                    <span className="rev-day-stat-val">{currency(selectedDayData.total)}</span>
                  </div>
                  <div className="rev-day-stat">
                    <span className="rev-day-stat-label">Check-ins</span>
                    <span className="rev-day-stat-val" style={{ color: '#f97316' }}>{currency(selectedDayData.checkin)}</span>
                  </div>
                  <div className="rev-day-stat">
                    <span className="rev-day-stat-label">Payments</span>
                    <span className="rev-day-stat-val" style={{ color: '#10b981' }}>{currency(selectedDayData.payment)}</span>
                  </div>
                  <div className="rev-day-stat">
                    <span className="rev-day-stat-label">Transactions</span>
                    <span className="rev-day-stat-val" style={{ color: '#64748b' }}>{selectedDayData.checkinCount + selectedDayData.paymentCount}</span>
                  </div>
                </div>
                <button className="rev-day-close" onClick={() => setSelectedDay(null)}>&times;</button>
              </div>
            )}
          </div>

          {/* ─── KPI Cards ─── */}
          <div className="rev-kpi-row">
            <div className="rev-kpi-card">
              <div className="rev-kpi-icon" style={{ background: 'rgba(255,87,34,0.12)', color: '#ff5722' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className="rev-kpi-body">
                <span className="rev-kpi-label">Total Revenue</span>
                <span className="rev-kpi-value">{currency(kpis.totalRev)}</span>
              </div>
              <span className={`rev-kpi-change ${kpis.growth >= 0 ? 'up' : 'down'}`}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d={kpis.growth >= 0 ? 'M5 1l4 6H1z' : 'M5 9l4-6H1z'} /></svg>
                {Math.abs(kpis.growth).toFixed(1)}%
              </span>
            </div>

            <div className="rev-kpi-card">
              <div className="rev-kpi-icon" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div className="rev-kpi-body">
                <span className="rev-kpi-label">Year Revenue</span>
                <span className="rev-kpi-value">{currency(data.thisYearRevenue)}</span>
              </div>
            </div>
          </div>

          {/* ─── Bottom Row ─── */}
          <div className="rev-bottom">
            {/* Revenue Breakdown */}
            <div className="rev-card rev-card-breakdown">
              <div className="rev-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                Revenue Breakdown
              </div>

              {/* Visual split bar */}
              {(kpis.ciRev > 0 || kpis.pyRev > 0) && (
                <div className="rev-split-bar">
                  {kpis.ciRev > 0 && (
                    <div className="rev-split-seg rev-split-ci" style={{ flex: kpis.ciRev / (kpis.ciRev + kpis.pyRev) }}>
                      <span className="rev-split-pct">{Math.round((kpis.ciRev / (kpis.ciRev + kpis.pyRev)) * 100)}%</span>
                    </div>
                  )}
                  {kpis.pyRev > 0 && (
                    <div className="rev-split-seg rev-split-py" style={{ flex: kpis.pyRev / (kpis.ciRev + kpis.pyRev) }}>
                      <span className="rev-split-pct">{Math.round((kpis.pyRev / (kpis.ciRev + kpis.pyRev)) * 100)}%</span>
                    </div>
                  )}
                </div>
              )}

              <div className="rev-breakdown-rows">
                <div className="rev-breakdown-item" onClick={() => setBreakdownModal('checkin')} style={{ cursor: 'pointer' }} title="View detailed breakdown">
                  <div className="rev-breakdown-left">
                    <span className="rev-breakdown-dot rev-dot-ci" />
                    <div>
                      <div className="rev-breakdown-label">Check-in Revenue</div>
                      <div className="rev-breakdown-count">{kpis.ciCount} check-in{kpis.ciCount !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="rev-breakdown-right">
                    <span className="rev-breakdown-val">{currency(kpis.ciRev)}</span>
                    {kpis.totalRev > 0 && <span className="rev-breakdown-pct">{Math.round((kpis.ciRev / kpis.totalRev) * 100)}%</span>}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
                <div className="rev-breakdown-div" />
                <div className="rev-breakdown-item" onClick={() => setBreakdownModal('payment')} style={{ cursor: 'pointer' }} title="View detailed breakdown">
                  <div className="rev-breakdown-left">
                    <span className="rev-breakdown-dot rev-dot-py" />
                    <div>
                      <div className="rev-breakdown-label">Payment Revenue</div>
                      <div className="rev-breakdown-count">{kpis.pyCount} payment{kpis.pyCount !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="rev-breakdown-right">
                    <span className="rev-breakdown-val">{currency(kpis.pyRev)}</span>
                    {kpis.totalRev > 0 && <span className="rev-breakdown-pct">{Math.round((kpis.pyRev / kpis.totalRev) * 100)}%</span>}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="rev-card rev-card-categories">
              <div className="rev-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Plan Breakdown
              </div>
              <div className="rev-category-list">
                {data.categoryBreakdown.length > 0 ? data.categoryBreakdown.map(c => (
                  <div key={c.category} className="rev-category-row" onClick={() => setPlanModal(c.category)} style={{ cursor: 'pointer' }} title="View members on this plan">
                    <div className="rev-category-left">
                      <span className="rev-category-name">{c.category}</span>
                      <span className="rev-category-count">{c.memberCount} member{c.memberCount !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="rev-category-rev">{currency(c.monthlyRevenue)}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: '8px' }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                )) : (
                  <div className="rev-empty-categories">No plan data available</div>
                )}
              </div>
            </div>

            <div className="rev-card rev-card-insight">
              <div className="rev-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                Insights
              </div>
              <p className="rev-insight-text">{insight}</p>
              <div className="rev-insight-meta">
                Based on {kpis.activeDays} day{kpis.activeDays !== 1 ? 's' : ''} of data in {monthNames[month - 1]} {year}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown detail modal */}
      {breakdownModal && (
        <div className="modal-overlay" onClick={() => setBreakdownModal(null)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBreakdownModal(null)}>&times;</button>
            <h3 style={{ marginBottom: '1.25rem' }}>
              {breakdownModal === 'checkin' ? 'Check-in' : 'Payment'} Revenue — {monthNames[month - 1]} {year}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>
                <span style={{ flex: 1 }}>Date</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Revenue</span>
                <span style={{ width: '80px', textAlign: 'right' }}>Count</span>
              </div>
              {(() => {
                const type = breakdownModal;
                const rows = chartData.filter(d => type === 'checkin' ? d.checkin > 0 : d.payment > 0);
                return rows.length > 0 ? rows.map(d => (
                  <div key={d.day} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: '6px', transition: 'background 0.12s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    onClick={() => setDetailModal({ type, date: d.date })}
                    title={`View ${type} details for ${monthNames[month - 1].slice(0, 3)} ${d.day}`}
                  >
                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                      {monthNames[month - 1].slice(0, 3)} {d.day}, {year}
                    </span>
                    <span style={{ width: '100px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: type === 'checkin' ? 'var(--accent)' : 'var(--success)' }}>
                      {currency(type === 'checkin' ? d.checkin : d.payment)}
                    </span>
                    <span style={{ width: '80px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {type === 'checkin' ? d.checkinCount : d.paymentCount}
                    </span>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                    No {breakdownModal} revenue recorded this month.
                  </div>
                );
              })()}
            </div>
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: breakdownModal === 'checkin' ? 'var(--accent)' : 'var(--success)' }}>
                {currency(breakdownModal === 'checkin' ? kpis.ciRev : kpis.pyRev)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Detail drill-down modal */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetailModal(null)}>&times;</button>
            <h3 style={{ marginBottom: '1.25rem' }}>
              {detailModal.type === 'checkin' ? 'Check-in' : 'Payment'} Details — {detailModal.date}
            </h3>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
            ) : detailRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No records for this date.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '360px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <span style={{ flex: 1 }}>Member</span>
                    {detailModal.type === 'checkin' && <span style={{ width: '80px', textAlign: 'right' }}>Time</span>}
                    <span style={{ width: '100px', textAlign: 'right' }}>Amount</span>
                  </div>
                  {detailRecords.map((r, i) => (
                    <div key={r.id ?? i} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.memberName ?? r.name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {r.memberId ?? r.member_id}
                        </span>
                      </div>
                      {detailModal.type === 'checkin' && (
                        <span style={{ width: '80px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.time}</span>
                      )}
                      <span style={{ width: '100px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: detailModal.type === 'checkin' ? 'var(--accent)' : 'var(--success)' }}>
                        ₱{(r.amount ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total records</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{detailRecords.length}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Plan breakdown modal */}
      {planModal && (
        <div className="modal-overlay" onClick={() => setPlanModal(null)}>
          <div className="modal-content" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPlanModal(null)}>&times;</button>
            <h3 style={{ marginBottom: '1.25rem' }}>{planModal} — Members</h3>
            {planLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading members...</div>
            ) : planMembers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No members found on this plan.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>
                    <span style={{ flex: 1 }}>Member ID</span>
                    <span style={{ flex: 1 }}>Name</span>
                    <span style={{ width: '85px', textAlign: 'left' }}>Period</span>
                    <span style={{ width: '100px', textAlign: 'right' }}>Revenue</span>
                    <span style={{ width: '90px', textAlign: 'right' }}>Status</span>
                  </div>
                  {(() => {
                    const activeMembers = planMembers.filter(m => (m.monthly_revenue ?? 0) > 0);
                    return activeMembers.length > 0 ? activeMembers.map(m => (
                      <div key={m.member_id} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: '6px', transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                      >
                        <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.member_id}</span>
                        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-main)' }}>{m.name}</span>
                        <span style={{ width: '85px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{planPeriod(m.plan)}</span>
                        <span style={{ width: '100px', fontSize: '0.85rem', color: '#38bdf8', textAlign: 'right', fontFamily: 'monospace', paddingRight: '8px' }}>₱{(m.monthly_revenue ?? 0).toLocaleString()}</span>
                        <span className={`badge ${m.status.toLowerCase().replace(/\s+/g, '-')}`} style={{ width: '90px', textAlign: 'center' }}>{m.status}</span>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>No members with revenue this month.</div>
                    );
                  })()}
                </div>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Active members (with revenue)</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{planMembers.filter(m => (m.monthly_revenue ?? 0) > 0).length}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
