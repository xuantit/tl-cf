import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightOutlined, CloudOutlined, CodeOutlined, SafetyCertificateOutlined, SwapOutlined, AppstoreOutlined } from '@ant-design/icons'

const shortcuts = [
  { to: '/templates', label: 'Templates', description: 'Reuse your configurations', icon: AppstoreOutlined, tone: 'gold' },
  { to: '/tools/workers', label: 'Workers / Pages', description: 'Build at the edge', icon: CodeOutlined, tone: 'violet' },
  { to: '/tools/tunnels', label: 'Tunnels', description: 'Connect your services', icon: SwapOutlined, tone: 'blue' },
  { to: '/tools/turnstile', label: 'Turnstile', description: 'Protect your forms', icon: SafetyCertificateOutlined, tone: 'green' },
]

/** Original workspace artwork and shortcuts, not a carousel or a source of fake metrics. */
export default function WorkspaceIntro() {
  const { t } = useTranslation()
  return (
    <section className="workspace-intro" aria-label={t('Workspace shortcuts')}>
      <div className="workspace-hero">
        <div className="workspace-hero-copy">
          <p className="workspace-eyebrow"><span aria-hidden="true" /> {t('YOUR CLOUDFLARE WORKSPACE')}</p>
          <h2>{t('Your cloud.')} <span>{t('One workspace.')}</span></h2>
          <p className="workspace-hero-description">{t('Domains, security and edge services. Everything you need, in one place.')}</p>
          <Link className="workspace-hero-link" to="/overview">{t('Explore overview')} <ArrowRightOutlined aria-hidden="true" /></Link>
        </div>
        <div className="workspace-art" aria-hidden="true">
          <div className="workspace-orbit workspace-orbit-outer" />
          <div className="workspace-orbit workspace-orbit-inner" />
          <div className="workspace-cloud"><CloudOutlined /></div>
          <div className="workspace-art-node workspace-art-dns">◈ <span>DNS</span></div>
          <div className="workspace-art-node workspace-art-edge"><CodeOutlined /> <span>EDGE</span></div>
          <div className="workspace-art-node workspace-art-ssl"><SafetyCertificateOutlined /> <span>SSL</span></div>
        </div>
      </div>
      <div className="workspace-section-heading">
        <h2>{t('What would you like to manage?')}</h2>
        <span>{t('Quick access')}</span>
      </div>
      <div className="workspace-shortcuts">
        {shortcuts.map(({ to, label, description, icon: Icon, tone }) => (
          <Link key={to} to={to} className={`workspace-shortcut workspace-shortcut-${tone}`}>
            <span className="workspace-shortcut-icon" aria-hidden="true"><Icon /></span>
            <span className="workspace-shortcut-copy"><strong>{t(label)}</strong><span>{t(description)}</span></span>
            <ArrowRightOutlined className="workspace-shortcut-arrow" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}