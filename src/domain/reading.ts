/** The AI's light emphasis becomes ordinary text in system calendars and alerts. */
export function plainReadingText(value: string): string {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}])__([^_\n]+)__(?![\p{L}\p{N}])/gu, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, '$1');
}
