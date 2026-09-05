/**
 * TradeMind OS — Browser Notification Service
 * Sends system-level desktop notifications even when the browser tab is minimized.
 */

class NotificationService {
  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window;
    this.permission = this.isSupported ? Notification.permission : 'denied';
  }

  async requestPermission() {
    if (!this.isSupported) return 'unsupported';
    try {
      const res = await Notification.requestPermission();
      this.permission = res;
      return res;
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
      return 'denied';
    }
  }

  hasPermission() {
    return this.isSupported && this.permission === 'granted';
  }

  notify(title, { body = '', tag = 'trademind-coach', icon = '/favicon.ico' } = {}) {
    if (!this.hasPermission()) {
      return null;
    }

    try {
      const notification = new Notification(title, {
        body,
        tag,
        icon,
        renotify: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (e) {
      console.warn('Error displaying notification:', e);
      return null;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
