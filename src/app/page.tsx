/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Immediately route visitors into the lived dashboard experience instead of a disposable splash page.
 * Guardrail: Momentum should begin on first paint.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
