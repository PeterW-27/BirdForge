import { ORDER_TYPES, money } from '../../domain/core.js';
import { REPORT_RANGES, businessReport, formatDuration } from '../../domain/reports.js';
import { text, typeLabel } from '../components/shared.js';

function trend(value) {
  if (value === null || value === undefined) return '<span class="report-trend is-new">new</span>';
  if (value === 0) return '<span class="report-trend">same as before</span>';
  return `<span class="report-trend ${value > 0 ? 'is-up' : 'is-down'}">${value > 0 ? '▲' : '▼'} ${Math.abs(value)}% vs previous</span>`;
}

function tile(label, value, note = '') {
  return `<div class="report-tile"><span>${text(label)}</span><strong>${value}</strong>${note}</div>`;
}

function chart(series) {
  const max = Math.max(1, ...series.map((point) => point.orders));
  const step = Math.ceil(series.length / 10);
  return `<div class="report-chart" role="img" aria-label="Orders received per ${series.length > 62 ? 'month' : 'day'}">${series.map((point, index) => `
    <div class="report-bar" title="${text(point.label)}: ${point.orders} orders, ${text(money(point.revenueCents))} delivered">
      <span class="report-bar-value">${point.orders || ''}</span>
      <span class="report-bar-fill" style="height:${Math.round((point.orders / max) * 100)}%"></span>
      <span class="report-bar-label">${index % step === 0 ? text(point.label) : ''}</span>
    </div>`).join('')}</div>`;
}

export function reportsPanel(state, ui, now = Date.now()) {
  const report = businessReport(state, { range: ui.reportRange, from: ui.reportFrom, to: ui.reportTo, now });
  const c = report.current;
  const custom = report.range === 'custom';
  const types = ORDER_TYPES.map((type) => {
    const count = c.byType[type];
    const share = c.received ? Math.round((count / c.received) * 100) : 0;
    return `<li><span>${text(typeLabel(type))}</span><span class="report-meter"><span style="width:${share}%"></span></span><strong>${count}</strong></li>`;
  }).join('');
  const top = c.topProducts.length
    ? `<table class="report-table"><thead><tr><th>Product</th><th>Pieces</th><th>Value</th></tr></thead><tbody>${c.topProducts.map((p) => `<tr><td>${text(p.name)}</td><td>${p.qty}</td><td>${p.cents ? text(money(p.cents)) : 'Quoted'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No goods were ordered in this period.</p>';
  return `<section class="report" id="business-report" aria-labelledby="report-title">
    <div class="report-toolbar surface">
      <div>
        <p class="eyebrow">Forge ledger</p>
        <h2 id="report-title">Business report</h2>
        <p class="muted report-period">${text(report.periodLabel)}</p>
      </div>
      <div class="report-controls">
        <label>Period<select id="report-range">${REPORT_RANGES.map((r) => `<option value="${r.id}" ${r.id === report.range ? 'selected' : ''}>${text(r.label)}</option>`).join('')}</select></label>
        ${custom ? `<label>From<input type="date" id="report-from" value="${text(ui.reportFrom || '')}"></label><label>To<input type="date" id="report-to" value="${text(ui.reportTo || '')}"></label>` : ''}
        <button type="button" class="button button-secondary" data-action="report-csv">Download CSV</button>
        <button type="button" class="button" data-action="report-print">Print</button>
      </div>
    </div>
    <div class="report-tiles">
      ${tile('Revenue (delivered)', text(money(c.revenueCents)), trend(report.revenueChange))}
      ${tile('Orders received', c.received, trend(report.orderChange))}
      ${tile('Booked value', text(money(c.bookedCents)))}
      ${tile('Average order', text(money(c.averageCents)))}
      ${tile('Average time to delivery', text(formatDuration(c.averageLeadMs)))}
      ${tile('On the work list now', report.queueLength, report.awaitingQuote ? `<span class="report-trend is-down">${report.awaitingQuote} awaiting a quote</span>` : '')}
    </div>
    <div class="report-grid">
      <article class="surface report-summary">
        <h3>Gunter's summary</h3>
        ${report.summary.map((line) => `<p>${text(line)}</p>`).join('')}
      </article>
      <article class="surface">
        <h3>Orders over time</h3>
        ${chart(report.series)}
      </article>
      <article class="surface">
        <h3>Order mix</h3>
        <ul class="report-mix">${types}</ul>
        <p class="muted report-footnote">${c.pieces} pieces ordered · ${c.finishedOrders} orders finished at the anvil · ${c.deliveredOrders} delivered</p>
      </article>
      <article class="surface">
        <h3>Best sellers</h3>
        ${top}
      </article>
    </div>
    <p class="muted report-footnote">Revenue counts orders when they are marked Delivered. Booked value counts priced orders placed in this period. Commissions and repairs count once Gunter sets a quote.</p>
  </section>`;
}
