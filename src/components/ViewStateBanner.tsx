import clsx from 'clsx'

type ViewStateBannerProps = {
  tone: 'loading' | 'error' | 'info'
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

const ViewStateBanner = ({ tone, title, message, actionLabel, onAction }: ViewStateBannerProps) => {
  return (
    <section
      className={clsx('view-state-banner', `tone-${tone}`)}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <div>
        <p className="view-state-title">{title}</p>
        <p className="view-state-message">{message}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" className="ghost-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  )
}

export default ViewStateBanner
