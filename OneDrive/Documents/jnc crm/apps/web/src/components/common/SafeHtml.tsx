/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlProps {
  content?: string | null;
  className?: string;
  fallback?: string;
}

const SANITIZE_CONFIG: any = {
  ALLOWED_TAGS: [
    'b',
    'i',
    'em',
    'strong',
    'u',
    's',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'span',
    'div',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
  ],
  ALLOWED_ATTR: ['class', 'title'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'href', 'src'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Renders HTML safely by sanitizing through DOMPurify with strict tag and attribute allowlists.
 * Neutralizes Stored XSS vectors (e.g. <img src=x onerror=alert(1)>).
 */
export const SafeHtml: React.FC<SafeHtmlProps> = ({
  content,
  className,
  fallback = '',
}) => {
  if (!content) {
    return fallback ? <span className={className}>{fallback}</span> : null;
  }

  const clean = DOMPurify.sanitize(content, SANITIZE_CONFIG);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
};

export default SafeHtml;
