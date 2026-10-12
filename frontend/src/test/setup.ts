import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Aria inspects pseudo-element styles, which jsdom does not implement.
// These tests assert behavior rather than layout; use the element's supported styles.
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => getComputedStyle(element);

afterEach(() => {
  cleanup();
});
