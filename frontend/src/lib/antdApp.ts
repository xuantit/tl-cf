import { App, message as staticMessage, Modal as staticModal, notification as staticNotification } from 'antd'

type AppApi = ReturnType<typeof App.useApp>

/**
 * antd's static `message` / `Modal` / `notification` can't read the dynamic
 * theme from ConfigProvider (they render outside the React tree), which triggers
 * the "Static function can not consume context" warning.
 *
 * These bindings default to the statics but are swapped for the context-aware
 * instances by <AntdAppBridge> (mounted inside <App> in main.tsx). Import
 * `message` / `modal` / `notification` from here instead of from 'antd'.
 */
export let message: AppApi['message'] = staticMessage
export let modal: AppApi['modal'] = staticModal as unknown as AppApi['modal']
export let notification: AppApi['notification'] = staticNotification

export function setAntdApp(api: AppApi): void {
  message = api.message
  modal = api.modal
  notification = api.notification
}
