import { lazy, Suspense } from 'react';
import { useNearViewport } from '../hooks/useNearViewport';
import type { VolatilityChartsProps } from './VolatilityCharts';

const VolatilityCharts = lazy(() => import('./VolatilityCharts'));

function LoadingPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <article className="panel chart-panel chart-loading-panel" aria-busy="true">
      <div className="panel-heading"><div><span className="section-kicker">ANALYTICS</span><h2>{title}</h2><p>{subtitle}</p></div></div>
      <div className="chart-loading-area" role="status">تُحمّل الرسوم عند الاقتراب منها لتسريع بدء التطبيق</div>
      <div className="chart-footnote"><span>تحليل وصفي فقط</span><span>لا توجد توصية تداول</span></div>
    </article>
  );
}

function LoadingPanels() {
  return <><LoadingPanel title="ابتسامة التقلب" subtitle="IV حسب سعر التنفيذ" /><LoadingPanel title="منحنى الانتهاء" subtitle="IV حسب تاريخ الانتهاء" /></>;
}

export default function DeferredVolatilityCharts(props: VolatilityChartsProps) {
  const { elementRef, isNearViewport } = useNearViewport<HTMLElement>('450px 0px');

  return (
    <section ref={elementRef} className="charts-grid" aria-label="رسوم التقلب الضمني" aria-busy={!isNearViewport}>
      {isNearViewport ? <Suspense fallback={<LoadingPanels />}><VolatilityCharts {...props} /></Suspense> : <LoadingPanels />}
    </section>
  );
}
