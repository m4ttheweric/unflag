import type { Read } from './types';

export function recordingProxy<T extends object>(
  inputName: string,
  value: T,
  onRead: (read: Read) => void,
): T {
  return new Proxy(value, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof prop === 'string') {
        onRead({ input: inputName, key: prop, value: v });
      }
      return v;
    },
  });
}
