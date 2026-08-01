import { useTranslation } from 'react-i18next'
import { passwordStrength } from '../../utils/password'

export interface StrengthMeterProps {
  password: string
}

/** 4-segment password strength meter (2.html register / settings). */
export function StrengthMeter({ password }: StrengthMeterProps) {
  const { t } = useTranslation()
  const score = password ? passwordStrength(password) : 0
  const labels = [t('too weak'), t('weak'), t('fair'), t('good'), t('strong')]
  return (
    <div className="mt-[6px]">
      <div className="flex gap-[3px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[4px] flex-1 overflow-hidden rounded-full bg-stroke">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: i < score ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 font-mono text-[11px] text-fg-3">
        {t('Strength')}: {labels[score]} · {t('≥12 chars with digits and special characters recommended')}
      </div>
    </div>
  )
}
