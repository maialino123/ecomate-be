/**
 * Utility functions for safe Telegram message formatting
 *
 * Telegram supports two parse modes:
 * - HTML: Requires escaping <, >, &
 * - MarkdownV2: Requires escaping _*[]()~`>#+-=|{}.!-
 *
 * HTML is recommended as it's simpler and more reliable.
 */

/**
 * Escape text for HTML parse mode
 * Escapes: < > &
 *
 * @param text - User input text that may contain HTML characters
 * @returns Safely escaped text for use with parse_mode: 'HTML'
 *
 * @example
 * escapeHtml('Use <b>tags</b> & "quotes"')
 * // Returns: 'Use &lt;b&gt;tags&lt;/b&gt; &amp; "quotes"'
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')   // Must be first to avoid double-escaping
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape text for MarkdownV2 parse mode
 * Escapes all MarkdownV2 special characters: _*[]()~`>#+-=|{}.!-
 *
 * Note: HTML mode is recommended over MarkdownV2 for simplicity
 *
 * @param text - User input text
 * @returns Safely escaped text for use with parse_mode: 'MarkdownV2'
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Truncate text safely for previews
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with '...' if needed
 *
 * @example
 * truncatePreview('This is a very long text', 10)
 * // Returns: 'This is a ...'
 */
export function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * Format a message with a label and user-generated content
 * Automatically handles escaping based on parse mode
 *
 * @param label - Static label text (already safe)
 * @param userContent - User-generated content (needs escaping)
 * @param parseMode - Telegram parse mode to use
 * @returns Formatted message ready to send
 *
 * @example
 * formatMessageWithUserContent('Reminder', 'Call John_Smith', 'HTML')
 * // Returns: '<b>Reminder:</b>\n\nCall John_Smith' (escaped)
 */
export function formatMessageWithUserContent(
  label: string,
  userContent: string,
  parseMode: 'HTML' | 'MarkdownV2' | null = 'HTML',
): string {
  if (parseMode === 'HTML') {
    return `<b>${label}:</b>\n\n${escapeHtml(userContent)}`;
  } else if (parseMode === 'MarkdownV2') {
    return `**${label}:**\n\n${escapeMarkdownV2(userContent)}`;
  } else {
    // Plain text - no escaping needed
    return `${label}:\n\n${userContent}`;
  }
}

/**
 * Create a safe list item with user content
 *
 * @param index - Item number (1-based)
 * @param content - User content to display
 * @param maxLength - Maximum length for preview
 * @returns Formatted list item with escaped content
 *
 * @example
 * createSafeListItem(1, 'Buy *milk* and _bread_', 20)
 * // Returns: '1. Buy *milk* and _brea...' (escaped for HTML)
 */
export function createSafeListItem(
  index: number,
  content: string,
  maxLength: number = 50,
): string {
  const preview = truncatePreview(content, maxLength);
  return `${index}. ${escapeHtml(preview)}`;
}
