import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  labelKey: string;
  run: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  action?: ToastAction;
}

export interface ToastOptions {
  title?: string;
  action?: ToastAction;
  durationMs?: number;
}

const DEFAULT_DURATION = 4200;
const ERROR_DURATION = 6000;
const ACTION_DURATION = 8000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private counter = 0;

  show(type: ToastType, message: string, title?: string): void {
    this.push(type, message, { title });
  }

  success(message: string, title?: string): void {
    this.show('success', message, title);
  }

  error(message: string, title?: string): void {
    this.show('error', message, title);
  }

  info(message: string, title?: string): void {
    this.show('info', message, title);
  }

  /** A toast that carries an inline action button; it stays up for 8 seconds. */
  showWithAction(
    type: ToastType,
    message: string,
    action: ToastAction,
    options?: Omit<ToastOptions, 'action'>,
  ): void {
    this.push(type, message, { ...options, action });
  }

  successWithAction(
    message: string,
    action: ToastAction,
    options?: Omit<ToastOptions, 'action'>,
  ): void {
    this.showWithAction('success', message, action, options);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** Runs a toast action and always dismisses the toast that carried it. */
  async runAction(toast: Toast): Promise<void> {
    const action = toast.action;
    this.dismiss(toast.id);
    if (!action) return;
    try {
      await action.run();
    } catch {
      // The action owner reports its own failures; a toast must not surface them.
    }
  }

  private push(type: ToastType, message: string, options: ToastOptions): void {
    const id = ++this.counter;
    const durationMs =
      options.durationMs ??
      (options.action ? ACTION_DURATION : type === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
    this.toasts.update((list) => [
      ...list.slice(-3),
      { id, type, message, title: options.title, action: options.action },
    ]);
    setTimeout(() => this.dismiss(id), durationMs);
  }
}
