import type { Metadata } from 'next';
import MfaChallenge from '@/auth/screens/MfaChallenge';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default function MfaPage() {
  return <MfaChallenge />;
}
