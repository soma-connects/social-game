'use client';

import { useEffect } from 'react';
import { installErrorCapture } from '@/lib/clientErrors';

/**
 * Starts keeping the page's recent errors, for feedback reports.
 *
 * Mounted in the root layout rather than inside the feedback form, because the
 * error worth reporting happens long before anyone opens the form — a listener
 * that starts when the form opens would only ever catch errors in the form.
 */
export default function ErrorCapture() {
  useEffect(() => {
    installErrorCapture();
  }, []);
  return null;
}
