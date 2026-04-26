export function isNativeApp(): boolean {
  return typeof (window as any).despia !== 'undefined';
}
