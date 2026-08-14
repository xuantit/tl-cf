import { createContext } from 'react'

/**
 * Slot cho DetailPanel ở layout focus của trang domain detail.
 *
 * DomainDetail render một ô trống full-height nằm cạnh phải vùng nội dung
 * (flex sibling) và publish element đó qua context này. DetailPanel portal
 * vào slot → panel ĐẨY toàn bộ content sang trái đúng như mockup 3.html,
 * thay vì nổi đè lên như modal.
 */
export const DetailPanelSlotContext = createContext<HTMLElement | null>(null)
