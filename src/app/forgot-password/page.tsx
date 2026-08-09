import type { Metadata } from 'next';
import ForgotPassword from '@/auth/pages/ForgotPassword';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
