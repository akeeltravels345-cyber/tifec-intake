// Temporary placeholder for mobile screens not built yet (Calendar, Me, Book).
// Keeps the bottom nav + FAB working while those screens are built out.
export default function MobileSoon({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mag">
      <header className="mag-head">
        <div className="mag-head-row">
          <div>
            <div className="mag-dow">TIFEC Schedule</div>
            <div className="mag-date">{title}</div>
          </div>
        </div>
      </header>
      <div className="mag-body">
        <div className="mag-empty" style={{ marginTop: 48 }}>
          <span className="mag-empty-ic" aria-hidden="true">✦</span>
          <p>{sub}</p>
          <a className="mag-empty-btn" href="/m">Back to Today</a>
        </div>
      </div>
    </div>
  );
}
