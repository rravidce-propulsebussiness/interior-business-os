import './dashboard-loading.css';

/* Branded splash shown while a workspace page streams in. Static markup only:
   no dates, user data or client-only values, so it can never cause a
   hydration mismatch. Motion is CSS-only and respects reduced motion. */
const skyline = [44, 70, 34, 92, 58, 78, 40, 66];

export default function DashboardLoading() {
  return (
    <div className="dash-splash" role="status" aria-live="polite">
      <div className="dash-splash-card">
        <span className="dash-splash-mark" aria-hidden="true">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 12 3l9 7.5M5 9v12h14V9M9 21v-8h6v8" />
          </svg>
        </span>
        <div className="dash-splash-skyline" aria-hidden="true">
          {skyline.map((height, index) => (
            <span
              key={index}
              style={{
                height: height + '%',
                animationDelay: index * 70 + 'ms',
              }}
            />
          ))}
        </div>
        <strong className="dash-splash-title">ProPulse Business OS</strong>
        <span className="dash-splash-text">Preparing your workspace…</span>
        <span className="dash-splash-progress" aria-hidden="true">
          <span />
        </span>
      </div>
    </div>
  );
}
