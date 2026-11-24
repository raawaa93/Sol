import { lazy, Suspense } from 'react';
import { useNearViewport } from '../hooks/useNearViewport';
import type { PayoffChartViewProps } from './PayoffChartView';

const PayoffChartView = lazy(() => import('./PayoffChartView'));

function LoadingChart() {
  return <div className="chart-loading-area payoff-chart-loading" role="status">يُحمّل رسم السيناريو عند الاقتراب منه</div>;
}

export default function DeferredPayoffChart(props: PayoffChartViewProps) {
  const { elementRef, isNearViewport } = useNearViewport<HTMLDivElement>('450px 0px');

  return (
    <div ref={elementRef} className="payoff-chart" aria-label="رسم سيناريو الربح والخسارة عند الانتهاء" aria-busy={!isNearViewport}>
      {isNearViewport ? <Suspense fallback={<LoadingChart />}><PayoffChartView {...props} /></Suspense> : <LoadingChart />}
    </div>
  );
}
