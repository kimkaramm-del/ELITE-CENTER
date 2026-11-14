export function ShimmerLoadingList({ label, rows = 3 }) {
  return (
    <div className="shimmer-loading-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="shimmer-loading-row" key={index} aria-hidden="true">
          <span className="shimmer-loading-avatar" />
          <span className="shimmer-loading-copy">
            <i />
            <i />
          </span>
        </div>
      ))}
    </div>
  )
}

export function ErrorBanner({ message, onRetry, onDismiss, retryLabel, dismissLabel }) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-icon" aria-hidden="true">!</span>
      <p>{message}</p>
      {onRetry && <button className="error-banner-action" type="button" onClick={onRetry}>{retryLabel}</button>}
      {onDismiss && <button className="error-banner-dismiss" type="button" aria-label={dismissLabel} onClick={onDismiss}>×</button>}
    </div>
  )
}
